import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useApp, denialMessage } from '../lib/app.tsx';
import { Card, Chip, Banner, Loading, Empty, Meter, Stat } from '../components/ui.tsx';
import { when, deadlineTone } from '../lib/format.ts';

type Board = {
  board: { id: string; caseId: string; caseNumber?: string; kind: string; statuteRef: string;
           description: string; dueAt: string; status: string; daysRemaining: number;
           percentElapsed: number; escalationLevel: number; escalateToRank: number | null }[];
  summary: { total: number; breached: number; critical: number; warning: number };
};
type Retention = {
  classes: Record<string, { label: string; note: string; years: number; permanent: boolean }>;
  candidates: { id: string; case_id: string; title: string; doc_type: string; retention_class: string; disposal_due: string }[];
  disposals: { id: string; document_id: string; certificate_hash: string; created_at: string; approved_by: string }[];
};

const RANK = ['', 'Constable', 'Head Constable', 'Sub-Inspector', 'SHO', 'DSP', 'SP', 'DIG', 'IG'];

export default function Compliance() {
  const { toast } = useApp();
  const [board, setBoard] = useState<Board | null>(null);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<Board>('/security/deadlines/board').then(setBoard)
      .catch((caught) => setError(denialMessage(caught)?.body || String(caught)));
    api.get<Retention>('/security/retention').then(setRetention).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  if (!board) return <Loading what="Computing statutory deadlines" error={error} onRetry={load} />;

  return (
    <div className="stack">
      <div>
        <h1>Statutory compliance</h1>
        <div className="muted small">
          Deadlines computed from the 2023 procedure code, with tiered escalation by rank.
        </div>
      </div>

      <Banner tone="info" title="The gap this closes">
        The new criminal statutes created roughly a dozen hard deadlines and several mandatory digital
        artefacts. Nobody has built the compliance layer for them - police stations are tracking
        two-month statutory deadlines on paper registers.
        <div className="tiny" style={{ marginTop: 6, opacity: .85 }}>
          Every section reference below is marked <code>[VERIFY]</code> until it has been checked against
          indiacode.nic.in. Do not put an unverified citation on a slide.
        </div>
      </Banner>

      <div className="grid c4">
        <Stat label="Tracked obligations" value={board.summary.total} note="open and breached" />
        <Stat label="Breached" value={board.summary.breached} tone={board.summary.breached ? 'danger' : 'ok'} />
        <Stat label="Critical (>90%)" value={board.summary.critical} tone={board.summary.critical ? 'warn' : 'ok'} />
        <Stat label="Warning (>60%)" value={board.summary.warning} />
      </div>

      <Card title="Deadline board" sub="Worst first" tight>
        {board.board.length === 0 ? <Empty>No open obligations.</Empty> : (
          <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>Case</th><th>Obligation</th><th style={{ width: 160 }}>Elapsed</th><th>Due</th><th>Escalated to</th></tr>
              </thead>
              <tbody>
                {board.board.map((deadline) => {
                  const tone = deadlineTone(deadline.percentElapsed);
                  return (
                    <tr key={deadline.id}>
                      <td className="small"><Link to={`/cases/${deadline.caseId}`}>{deadline.caseNumber}</Link></td>
                      <td>
                        <div className="small">{deadline.kind.replace(/_/g, ' ')}</div>
                        <div className="tiny muted mono">{deadline.statuteRef}</div>
                      </td>
                      <td>
                        <Meter value={deadline.percentElapsed} tone={tone} />
                        <div className="tiny muted" style={{ marginTop: 3 }}>{Math.round(deadline.percentElapsed * 100)}%</div>
                      </td>
                      <td className="small num">
                        {deadline.daysRemaining < 0
                          ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{Math.abs(deadline.daysRemaining)}d overdue</span>
                          : `${deadline.daysRemaining}d`}
                        <div className="tiny muted">{when(deadline.dueAt)}</div>
                      </td>
                      <td>
                        {deadline.escalateToRank
                          ? <Chip tone={tone}>{RANK[deadline.escalateToRank]}</Chip>
                          : <span className="muted tiny">not yet</span>}
                        {deadline.escalationLevel > 0 && (
                          <div className="tiny muted">level {deadline.escalationLevel}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {retention && (
        <div className="grid split">
          <Card title="Retention and disposal" sub="Proposed on schedule, executed only with human approval" tight>
            {retention.candidates.length === 0 ? <Empty>Nothing has reached the end of its retention period.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Document</th><th>Class</th><th>Due</th><th /></tr></thead>
                  <tbody>
                    {retention.candidates.map((candidate) => (
                      <tr key={candidate.id}>
                        <td className="small"><Link to={`/documents/${candidate.id}`}>{candidate.title}</Link></td>
                        <td><Chip tone="n">{candidate.retention_class}</Chip></td>
                        <td className="small">{when(candidate.disposal_due)}</td>
                        <td>
                          <button className="sm" onClick={() => api.post('/security/retention/dispose',
                            { documentId: candidate.id, reason: 'Retention period expired' })
                            .then((r) => { toast('ok', 'Disposed with a certificate of destruction', JSON.stringify(r)); load(); })
                            .catch((error) => toast('danger', 'Refused', String(error)))}>
                            Dispose
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: 14 }} className="tiny muted">
              Disposal is cryptographic erasure plus a signed certificate of destruction. The on-chain
              anchor survives, so it stays provable that the document existed and was lawfully destroyed
              rather than quietly lost. A legal hold overrides the schedule entirely.
            </div>
          </Card>

          <Card title="Retention classes">
            <div className="stack" style={{ gap: 11 }}>
              {Object.values(retention.classes).map((cls) => (
                <div key={cls.label}>
                  <div className="row" style={{ gap: 7 }}>
                    <strong className="small">{cls.label}</strong>
                    {cls.permanent && <Chip tone="seal">permanent</Chip>}
                  </div>
                  <div className="tiny muted">{cls.note}</div>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="tiny muted">
              Periods here are placeholders. A deployment loads the applicable state police manual
              schedule under the Public Records Act.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
