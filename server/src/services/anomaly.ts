import { all, get, run, now } from '../db/index.ts';
import { id } from '../core/ids.ts';

/**
 * Behavioural anomaly detection over the audit log.
 *
 * The largest realistic threat in this domain is not an external attacker; it is
 * an officer with entirely legitimate credentials leaking a sensitive file. So
 * this module baselines each user and looks for the shapes that misuse actually
 * takes, and routes what it finds to a supervisor - not to a log nobody reads.
 *
 * A rules layer over known-bad patterns runs first (deterministic, explainable,
 * demonstrable on stage); production adds sequence and frequency models over the
 * same event stream. Rules stay regardless: an alert an officer cannot explain to
 * a court is not much use.
 */

export type Signal = {
  kind: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: Record<string, unknown>;
};

const BULK_DOWNLOAD_THRESHOLD = 8;
const BULK_WINDOW_MINUTES = 10;
const OFF_HOURS_START = 22;
const OFF_HOURS_END = 6;
const DENIAL_THRESHOLD = 4;

type Event = {
  id: string; ts: string; actor_id: string | null; action: string;
  case_id: string | null; outcome: string; resource_id: string | null;
};

function recentEvents(actorId: string, minutes: number): Event[] {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  return all<Event>(
    'SELECT id, ts, actor_id, action, case_id, outcome, resource_id FROM audit_events WHERE actor_id = ? AND ts >= ? ORDER BY ts',
    actorId, since,
  );
}

/** Runs after each significant action. Returns the signals it raised. */
export function evaluateActor(actorId: string): Signal[] {
  const signals: Signal[] = [];
  const window = recentEvents(actorId, BULK_WINDOW_MINUTES);

  const downloads = window.filter((e) => e.action === 'document.download' && e.outcome === 'allow');
  if (downloads.length >= BULK_DOWNLOAD_THRESHOLD) {
    signals.push({
      kind: 'bulk_download',
      severity: 'high',
      title: `Bulk download: ${downloads.length} documents in ${BULK_WINDOW_MINUTES} minutes`,
      detail: {
        count: downloads.length,
        windowMinutes: BULK_WINDOW_MINUTES,
        cases: [...new Set(downloads.map((d) => d.case_id).filter(Boolean))],
      },
    });
  }

  const hour = new Date().getHours();
  if ((hour >= OFF_HOURS_START || hour < OFF_HOURS_END) && downloads.length > 0) {
    signals.push({
      kind: 'off_hours_access',
      severity: 'medium',
      title: `Off-hours document access at ${String(hour).padStart(2, '0')}:00`,
      detail: { hour, documents: downloads.length },
    });
  }

  const denials = window.filter((e) => e.outcome === 'deny');
  if (denials.length >= DENIAL_THRESHOLD) {
    signals.push({
      kind: 'repeated_denials',
      severity: 'high',
      title: `${denials.length} access denials in ${BULK_WINDOW_MINUTES} minutes`,
      detail: { count: denials.length, actions: [...new Set(denials.map((d) => d.action))] },
    });
  }

  // Interest in cases the officer has no connection to.
  const touchedCases = [...new Set(window.map((e) => e.case_id).filter(Boolean))] as string[];
  const assigned = new Set(
    all<{ case_id: string }>('SELECT case_id FROM case_assignments WHERE user_id = ?', actorId).map((r) => r.case_id),
  );
  const unassigned = touchedCases.filter((caseId) => !assigned.has(caseId));
  if (unassigned.length >= 3) {
    signals.push({
      kind: 'unassigned_case_browsing',
      severity: 'high',
      title: `Activity across ${unassigned.length} cases this officer is not assigned to`,
      detail: { cases: unassigned },
    });
  }

  // Searching for a case you have no connection to is itself a signal.
  const searches = window.filter((e) => e.action === 'search.query');
  if (searches.length >= 12) {
    signals.push({
      kind: 'search_sweeping',
      severity: 'medium',
      title: `${searches.length} searches in ${BULK_WINDOW_MINUTES} minutes`,
      detail: { count: searches.length },
    });
  }

  for (const signal of signals) raise(signal, actorId);
  return signals;
}

function raise(signal: Signal, actorId: string): void {
  // Don't re-raise the same open signal for the same actor within the window.
  const existing = get(
    `SELECT id FROM alerts WHERE kind = ? AND actor_id = ? AND status = 'open' AND created_at >= ?`,
    signal.kind, actorId, new Date(Date.now() - BULK_WINDOW_MINUTES * 60_000).toISOString(),
  );
  if (existing) return;
  run(
    `INSERT INTO alerts (id, kind, severity, title, detail, actor_id, status, created_at)
     VALUES (?,?,?,?,?,?, 'open', ?)`,
    id('ALR'), signal.kind, signal.severity, signal.title, JSON.stringify(signal.detail), actorId, now(),
  );
}

export function openAlerts(limit = 100) {
  return all(
    `SELECT a.*, u.full_name AS actor_name, u.designation AS actor_designation, c.case_number
     FROM alerts a
     LEFT JOIN users u ON u.id = a.actor_id
     LEFT JOIN cases c ON c.id = a.case_id
     WHERE a.status = 'open'
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
              a.created_at DESC
     LIMIT ?`,
    limit,
  );
}

export function acknowledgeAlert(alertId: string, actorId: string) {
  run("UPDATE alerts SET status = 'acknowledged', acked_by = ? WHERE id = ?", actorId, alertId);
  return { alertId, status: 'acknowledged' };
}

/** Per-user activity baseline shown on the CISO console. */
export function actorBaseline(actorId: string) {
  const rows = all<{ action: string; n: number }>(
    `SELECT action, COUNT(*) AS n FROM audit_events WHERE actor_id = ? GROUP BY action ORDER BY n DESC`,
    actorId,
  );
  const denials = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM audit_events WHERE actor_id = ? AND outcome = 'deny'", actorId,
  );
  return { actorId, actions: rows, denials: denials?.n ?? 0 };
}
