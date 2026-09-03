import { all, get, run, now, json } from '../db/index.ts';
import { id } from '../core/ids.ts';
import { record as audit } from './audit.ts';

/**
 * Statutory deadline engine — the heart of the compliance value.
 *
 * The 2023 criminal statutes (effective 1 July 2024) created roughly a dozen hard
 * deadlines and several new mandatory digital artefacts, and nobody has built the
 * compliance layer for them. Police stations are tracking two-month statutory
 * deadlines on paper registers. That is the gap this module closes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VERIFY BEFORE SUBMISSION. Every `statuteRef` below is a research lead,    │
 * │ not a verified citation. Confirm each section number against             │
 * │ indiacode.nic.in and correct this table before it reaches a slide.       │
 * │ See docs/LEGAL_MAPPING.md and the checklist in docs/SOLUTION.md §22.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export type DeadlineRule = {
  kind: string;
  statuteRef: string;
  description: string;
  days: number;
  /** applies only when the case matches one of these offence categories; empty = all */
  categories: string[];
  /** escalate to progressively senior ranks at these fractions of the window */
  escalateAt: number[];
};

export const DEADLINE_RULES: DeadlineRule[] = [
  {
    kind: 'investigation_completion_sexual_offence',
    statuteRef: 'BNSS s.193(3) proviso [VERIFY]',
    description: 'Investigation in a rape / sexual offence case to be completed within two months of recording the information.',
    days: 60, categories: ['sexual_offence', 'pocso'], escalateAt: [0.6, 0.8, 0.9],
  },
  {
    kind: 'progress_intimation',
    statuteRef: 'BNSS s.193(3)(ii) [VERIFY]',
    description: 'Informant / victim to be informed of the progress of investigation within ninety days, including by electronic means.',
    days: 90, categories: [], escalateAt: [0.8, 0.95],
  },
  {
    kind: 'supply_of_copies',
    statuteRef: 'BNSS s.230 [VERIFY]',
    description: 'Copies of the FIR, statements, charge sheet and other material to be supplied to the accused and the victim within fourteen days.',
    days: 14, categories: [], escalateAt: [0.7, 0.9],
  },
  {
    kind: 'medical_report_forwarding',
    statuteRef: 'BNSS s.184(6) [VERIFY]',
    description: 'Medical examination report to be forwarded to the investigating officer within the stipulated period.',
    days: 7, categories: ['sexual_offence', 'pocso'], escalateAt: [0.7, 0.9],
  },
  {
    kind: 'forensic_visit',
    statuteRef: 'BNSS s.176(3) [VERIFY]',
    description: 'Forensic team visit and videography of the scene for offences punishable with seven years or more.',
    days: 3, categories: ['grave_offence', 'sexual_offence', 'homicide'], escalateAt: [0.6, 0.9],
  },
  {
    kind: 'chargesheet_custody_limit',
    statuteRef: 'BNSS s.187(3) [VERIFY]',
    description: 'Charge sheet to be filed within the custody limit (60 or 90 days by offence gravity) or the accused becomes entitled to default bail.',
    days: 90, categories: [], escalateAt: [0.66, 0.85, 0.95],
  },
  {
    kind: 'efir_signature',
    statuteRef: 'BNSS s.173(1) proviso [VERIFY]',
    description: 'Information given electronically must be signed by the informant within three days.',
    days: 3, categories: [], escalateAt: [0.7],
  },
];

/** Ranks notified at each escalation step: SHO -> DSP -> SP. */
const ESCALATION_RANKS = [4, 5, 6];

export function createDeadlinesForCase(caseId: string, category: string, registeredAt: string): number {
  let created = 0;
  for (const rule of DEADLINE_RULES) {
    if (rule.categories.length > 0 && !rule.categories.includes(category)) continue;
    const start = new Date(registeredAt);
    const due = new Date(start.getTime() + rule.days * 86_400_000);
    run(
      `INSERT INTO deadlines (id, case_id, kind, statute_ref, description, starts_at, due_at, status)
       VALUES (?,?,?,?,?,?,?, 'open')`,
      id('DDL'), caseId, rule.kind, rule.statuteRef, rule.description, start.toISOString(), due.toISOString(),
    );
    created++;
  }
  return created;
}

export type DeadlineView = {
  id: string; caseId: string; caseNumber?: string; kind: string; statuteRef: string;
  description: string; startsAt: string; dueAt: string; status: string;
  daysRemaining: number; percentElapsed: number; escalationLevel: number;
  escalateToRank: number | null; delayReason: string | null;
};

function view(row: Record<string, unknown>): DeadlineView {
  const startsAt = String(row.starts_at);
  const dueAt = String(row.due_at);
  const start = new Date(startsAt).getTime();
  const due = new Date(dueAt).getTime();
  const current = Date.now();
  const window = Math.max(due - start, 1);
  const percentElapsed = Math.min(Math.max((current - start) / window, 0), 1.5);
  const rule = DEADLINE_RULES.find((r) => r.kind === row.kind);
  const escalationLevel = rule ? rule.escalateAt.filter((threshold) => percentElapsed >= threshold).length : 0;
  return {
    id: String(row.id), caseId: String(row.case_id),
    caseNumber: row.case_number ? String(row.case_number) : undefined,
    kind: String(row.kind), statuteRef: String(row.statute_ref), description: String(row.description),
    startsAt, dueAt, status: String(row.status),
    daysRemaining: Math.round((due - current) / 86_400_000),
    percentElapsed: Number(percentElapsed.toFixed(3)),
    escalationLevel,
    escalateToRank: escalationLevel > 0 ? ESCALATION_RANKS[Math.min(escalationLevel - 1, 2)]! : null,
    delayReason: row.delay_reason ? String(row.delay_reason) : null,
  };
}

export function deadlinesForCase(caseId: string): DeadlineView[] {
  return all('SELECT * FROM deadlines WHERE case_id = ? ORDER BY due_at', caseId).map(view);
}

/** Station / district compliance board, worst-first. */
export function deadlineBoard(filter: { district?: string; station?: string } = {}): DeadlineView[] {
  const clauses: string[] = ["d.status = 'open'"];
  const params: unknown[] = [];
  if (filter.district) { clauses.push('c.district = ?'); params.push(filter.district); }
  if (filter.station) { clauses.push('c.station = ?'); params.push(filter.station); }
  const rows = all(
    `SELECT d.*, c.case_number, c.district, c.station, c.sensitive_mode
     FROM deadlines d JOIN cases c ON c.id = d.case_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY d.due_at`,
    ...params,
  );
  return rows.map(view).sort((a, b) => b.percentElapsed - a.percentElapsed);
}

/** Refreshes escalation levels and raises alerts. Runs on a timer and on demand. */
export function sweep(): { escalated: number; breached: number } {
  const open = all('SELECT * FROM deadlines WHERE status = ?', 'open').map(view);
  let escalated = 0;
  let breached = 0;
  for (const deadline of open) {
    const row = get<{ escalation_level: number }>('SELECT escalation_level FROM deadlines WHERE id = ?', deadline.id);
    if (deadline.percentElapsed >= 1) {
      run("UPDATE deadlines SET status = 'breached', escalation_level = ? WHERE id = ?", deadline.escalationLevel, deadline.id);
      run(
        `INSERT INTO alerts (id, kind, severity, title, detail, case_id, created_at)
         VALUES (?, 'deadline_breached', 'critical', ?, ?, ?, ?)`,
        id('ALR'), `Statutory deadline breached: ${deadline.kind}`,
        JSON.stringify({ statuteRef: deadline.statuteRef, dueAt: deadline.dueAt }),
        deadline.caseId, now(),
      );
      breached++;
      continue;
    }
    if (row && deadline.escalationLevel > row.escalation_level) {
      run('UPDATE deadlines SET escalation_level = ? WHERE id = ?', deadline.escalationLevel, deadline.id);
      run(
        `INSERT INTO alerts (id, kind, severity, title, detail, case_id, created_at)
         VALUES (?, 'deadline_escalation', ?, ?, ?, ?, ?)`,
        id('ALR'), deadline.escalationLevel >= 3 ? 'critical' : deadline.escalationLevel === 2 ? 'high' : 'medium',
        `Deadline escalation L${deadline.escalationLevel}: ${deadline.kind}`,
        JSON.stringify({
          statuteRef: deadline.statuteRef, dueAt: deadline.dueAt,
          notifyRank: deadline.escalateToRank, percentElapsed: deadline.percentElapsed,
        }),
        deadline.caseId, now(),
      );
      escalated++;
    }
  }
  return { escalated, breached };
}

export function completeDeadline(deadlineId: string, actorId: string, delayReason?: string) {
  const deadline = get<{ case_id: string; kind: string; due_at: string }>(
    'SELECT case_id, kind, due_at FROM deadlines WHERE id = ?', deadlineId,
  );
  if (!deadline) throw new Error('deadline not found');
  const late = new Date() > new Date(deadline.due_at);
  run(
    "UPDATE deadlines SET status = ?, completed_at = ?, delay_reason = ? WHERE id = ?",
    late ? 'breached' : 'met', now(), delayReason ?? null, deadlineId,
  );
  audit({
    actorId, actorLabel: actorId, action: 'deadline.complete', outcome: 'allow',
    resourceType: 'deadline', resourceId: deadlineId, caseId: deadline.case_id,
    // The reason for delay becomes part of the permanent case record.
    detail: { kind: deadline.kind, late, delayReason: delayReason ?? null },
  });
  return { deadlineId, status: late ? 'breached' : 'met' };
}

export { json };
