import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useApp } from '../lib/app.tsx';
import { Card, Stat, Chip, Banner, Loading, Meter, Empty } from '../components/ui.tsx';
import { ago, deadlineTone } from '../lib/format.ts';

type Dash = {
  cases: number; sensitiveCases: number; documents: number; anchors: number;
  auditEvents: number; auditBatches: number; openAlerts: number; compromised: number;
  ledger: { driver: string; chainId: string; height: number; chainIntact?: boolean; validators?: string[]; consensus?: string };
  deadlines: { breached: number; critical: number; upcoming: {
    id: string; caseId: string; caseNumber?: string; kind: string; statuteRef: string;
    dueAt: string; daysRemaining: number; percentElapsed: number; escalateToRank: number | null;
  }[] };
  alerts: { id: string; kind: string; severity: string; title: string; created_at: string; actor_name?: string }[];
};

const RANK = ['', 'Constable', 'Head Constable', 'Sub-Inspector', 'SHO / Inspector', 'DSP', 'SP', 'DIG', 'IG'];

export default function Dashboard() {
  const { user } = useApp();
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => { api.get<Dash>('/security/dashboard').then(setData).catch(() => undefined); }, []);
  if (!data) return <Loading what="Loading dashboard" />;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Station overview</h1>
          <div className="muted small">
            {user!.fullName} · {user!.designation} · {user!.station ?? user!.unit}, {user!.district}
          </div>
        </div>
        <Link className="btn" to="/cases">All cases →</Link>
      </div>

      {data.compromised > 0 && (
        <Banner tone="danger" alarm title={`${data.compromised} document${data.compromised > 1 ? 's have' : ' has'} failed integrity verification`}>
          The recomputed fingerprint no longer matches the value anchored at seal time. The object is locked
          and an incident has been opened. Open the audit trail to see who touched it.
        </Banner>
      )}

      <div className="grid c4">
        <Stat label="Cases" value={data.cases} note={`${data.sensitiveCases} in Sensitive Case Mode`} />
        <Stat label="Documents sealed" value={data.documents} note={`${data.anchors} ledger anchors`} />
        <Stat label="Deadlines breached" value={data.deadlines.breached}
              tone={data.deadlines.breached ? 'danger' : 'ok'}
              note={`${data.deadlines.critical} within 10% of expiry`} />
        <Stat label="Open alerts" value={data.openAlerts} tone={data.openAlerts ? 'warn' : 'ok'}
              note="Behavioural + integrity" />
      </div>

      <div className="grid split">
        <Card
          title="Statutory deadlines closest to expiry"
          sub="Computed from the 2023 procedure code. Escalation is automatic, by rank."
          actions={<Link className="btn sm" to="/compliance">Full board →</Link>}
          tight
        >
          {data.deadlines.upcoming.length === 0 ? <Empty>No open deadlines in your jurisdiction.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Case</th><th>Obligation</th><th style={{ width: 150 }}>Elapsed</th><th>Due</th><th>Escalation</th></tr>
                </thead>
                <tbody>
                  {data.deadlines.upcoming.map((deadline) => {
                    const tone = deadlineTone(deadline.percentElapsed);
                    return (
                      <tr key={deadline.id}>
                        <td><Link to={`/cases/${deadline.caseId}`}>{deadline.caseNumber ?? '—'}</Link></td>
                        <td>
                          <div>{deadline.kind.replace(/_/g, ' ')}</div>
                          <div className="tiny muted">{deadline.statuteRef}</div>
                        </td>
                        <td>
                          <Meter value={deadline.percentElapsed} tone={tone} />
                          <div className="tiny muted" style={{ marginTop: 3 }}>
                            {Math.round(deadline.percentElapsed * 100)}%
                          </div>
                        </td>
                        <td className="num small">
                          {deadline.daysRemaining < 0
                            ? <span style={{ color: 'var(--danger)' }}>{Math.abs(deadline.daysRemaining)}d overdue</span>
                            : `${deadline.daysRemaining}d left`}
                        </td>
                        <td>
                          {deadline.escalateToRank
                            ? <Chip tone={tone}>{RANK[deadline.escalateToRank] ?? `rank ${deadline.escalateToRank}`}</Chip>
                            : <span className="muted small">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Consortium ledger" sub={data.ledger.consensus}>
            <dl className="kv">
              <dt>Driver</dt><dd><Chip tone={data.ledger.driver === 'evm' ? 'ok' : 'a'}>{data.ledger.driver}</Chip></dd>
              <dt>Chain</dt><dd className="mono">{data.ledger.chainId}</dd>
              <dt>Height</dt><dd className="num">{data.ledger.height} blocks</dd>
              <dt>Chain integrity</dt>
              <dd>{data.ledger.chainIntact === false
                ? <Chip tone="danger">BROKEN</Chip>
                : <Chip tone="ok"><span className="dot" />every link re-derived</Chip>}</dd>
            </dl>
            {data.ledger.validators && (
              <>
                <div className="divider" />
                <div className="tiny muted" style={{ marginBottom: 6 }}>Validator set — independent institutions</div>
                <div className="row" style={{ gap: 5 }}>
                  {data.ledger.validators.map((validator) => <Chip key={validator} tone="n">{validator}</Chip>)}
                </div>
              </>
            )}
            <div className="divider" />
            <Link className="btn sm" to="/ledger">Explore the chain →</Link>
          </Card>

          <Card title="Recent alerts" sub="Routed to a supervisor, not to a log nobody reads" tight>
            {data.alerts.length === 0 ? <Empty>Nothing flagged.</Empty> : (
              <div className="stack" style={{ gap: 0 }}>
                {data.alerts.map((alert) => (
                  <div key={alert.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                    <div className="row" style={{ gap: 7 }}>
                      <Chip tone={alert.severity === 'critical' ? 'danger' : alert.severity === 'high' ? 'warn' : 'n'}>
                        {alert.severity}
                      </Chip>
                      <span className="tiny muted">{ago(alert.created_at)}</span>
                    </div>
                    <div className="small" style={{ marginTop: 4 }}>{alert.title}</div>
                    {alert.actor_name && <div className="tiny muted">{alert.actor_name}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="Audit assurance" sub="Every event Merkle-batched; only the root is anchored">
        <div className="grid c4">
          <div><div className="k tiny muted">Events recorded</div><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{data.auditEvents}</div></div>
          <div><div className="k tiny muted">Batches anchored</div><div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{data.auditBatches}</div></div>
          <div><div className="k tiny muted">On-chain transactions saved</div><div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ok)' }}>
            {Math.max(data.auditEvents - data.auditBatches, 0)}
          </div></div>
          <div className="small muted" style={{ alignSelf: 'center' }}>
            One transaction per event would not scale to 16,000 police stations.
            Batching collapses them to one root while each event keeps an individually verifiable proof.
          </div>
        </div>
        <div className="divider" />
        <Link className="btn sm" to="/audit">Open the audit trail →</Link>
      </Card>
    </div>
  );
}
