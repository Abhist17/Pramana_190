import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useApp, denialMessage } from '../lib/app.tsx';
import { Card, Chip, Banner, Empty, Loading, Modal, Hash } from '../components/ui.tsx';
import { when, ago, shortHash } from '../lib/format.ts';

type Event = {
  id: string; ts: string; actor_id: string | null; actor_name?: string; actor_designation?: string;
  action: string; resource_type: string | null; resource_id: string | null; case_id: string | null;
  case_number?: string; purpose_code: string | null; outcome: string; reason: string | null;
  detail: Record<string, unknown>; batch_id: string | null; ip: string | null;
};
type Batch = { id: string; root: string; scope: string; event_count: number; anchor_id: string | null; created_at: string };
type Feed = { events: Event[]; batches: Batch[]; unbatched: number };
type Alert = { id: string; kind: string; severity: string; title: string; detail: Record<string, unknown>;
               actor_name?: string; case_number?: string; created_at: string; status: string };
type Proof = {
  eventId: string; batchId: string; verified: boolean;
  proof: { leaf: string; leafIndex: number; root: string; treeSize: number; path: { hash: string; position: string }[] };
  anchor: { tx_ref: string; block_number: number | null; chain_id: string; created_at: string } | null;
  error?: string;
};

export default function Audit() {
  const { toast } = useApp();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [denial, setDenial] = useState<{ title: string; body: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'deny'>('all');
  const [proof, setProof] = useState<Proof | null>(null);
  const [scope, setScope] = useState<string>('');
  const [cases, setCases] = useState<{ id: string; caseNumber: string }[]>([]);

  useEffect(() => {
    api.get<{ cases: { id: string; caseNumber: string }[] }>('/cases')
      .then((r) => setCases(r.cases)).catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    const query = `limit=250${filter === 'deny' ? '&outcome=deny' : ''}${scope ? `&caseId=${scope}` : ''}`;
    api.get<Feed>(`/security/audit?${query}`)
      .then((data) => { setFeed(data); setDenial(null); })
      .catch((error) => { setFeed(null); setDenial(denialMessage(error)); });
    api.get<{ alerts: Alert[] }>('/security/alerts').then((r) => setAlerts(r.alerts)).catch(() => undefined);
  }, [filter, scope]);

  useEffect(load, [load]);

  /**
   * The station-wide trail is an oversight capability. An investigating officer
   * is not refused outright - they may read the trail of a case they hold, which
   * answers the question they actually have ("who else opened my file"). So a
   * denial here offers the scoped view rather than a dead end.
   */
  if (denial) {
    return (
      <div className="stack">
        <h1>Audit trail</h1>
        <Banner tone="warn" title={denial.title}>
          {denial.body}
          <div className="tiny" style={{ marginTop: 7, opacity: .85 }}>
            The station-wide trail is reserved for oversight roles. You can still read the audit trail of
            any case you are assigned to.
          </div>
        </Banner>
        <Card title="Read the trail for one of your cases">
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="">Select a case…</option>
            {cases.map((row) => <option key={row.id} value={row.id}>{row.caseNumber}</option>)}
          </select>
        </Card>
      </div>
    );
  }
  if (!feed) return <Loading what="Loading audit trail" />;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Audit trail</h1>
          <div className="muted small">
            Append-only. Every read, download, print, share, denial <em>and search query</em> - Merkle-batched and anchored.
          </div>
        </div>
        <div className="row">
          <select value={scope} onChange={(event) => setScope(event.target.value)} style={{ width: 190 }}>
            <option value="">All cases (oversight)</option>
            {cases.map((row) => <option key={row.id} value={row.id}>{row.caseNumber}</option>)}
          </select>
          <button className={filter === 'all' ? 'primary' : ''} onClick={() => setFilter('all')}>All</button>
          <button className={filter === 'deny' ? 'primary' : ''} onClick={() => setFilter('deny')}>Denials only</button>
          <button onClick={() => api.post('/security/audit/seal').then((r) => {
            toast('ok', 'Batch sealed', JSON.stringify(r)); load();
          })}>Seal batch now</button>
        </div>
      </div>

      {alerts.length > 0 && (
        <Card title={`Alerts (${alerts.length})`} sub="Routed to a supervisor, not to a log nobody reads" tight>
          <div>
            {alerts.map((alert) => (
              <div key={alert.id} style={{ padding: '11px 16px', borderBottom: '1px solid var(--line)' }}>
                <div className="spread">
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <Chip tone={alert.severity === 'critical' ? 'danger' : alert.severity === 'high' ? 'warn' : 'n'}>
                        {alert.severity}
                      </Chip>
                      <strong className="small">{alert.title}</strong>
                    </div>
                    <div className="tiny muted" style={{ marginTop: 3 }}>
                      {alert.kind.replace(/_/g, ' ')}
                      {alert.actor_name && ` · ${alert.actor_name}`}
                      {alert.case_number && ` · ${alert.case_number}`}
                      {' · '}{ago(alert.created_at)}
                    </div>
                  </div>
                  <button className="sm" onClick={() => api.post(`/security/alerts/${alert.id}/acknowledge`).then(load)}>
                    Acknowledge
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid c4">
        <Card title="Events"><div style={{ fontSize: 24, fontWeight: 700 }}>{feed.events.length}</div>
          <div className="tiny muted">most recent</div></Card>
        <Card title="Batches anchored"><div style={{ fontSize: 24, fontWeight: 700 }}>{feed.batches.length}</div>
          <div className="tiny muted">one root per batch</div></Card>
        <Card title="Awaiting batch"><div style={{ fontSize: 24, fontWeight: 700 }}>{feed.unbatched}</div>
          <div className="tiny muted">sealed at the next interval</div></Card>
        <Card title="Denials shown"><div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)' }}>
          {feed.events.filter((e) => e.outcome === 'deny').length}</div>
          <div className="tiny muted">refused access attempts</div></Card>
      </div>

      <Card title="Events" sub="Click any event to produce its standalone inclusion proof" tight>
        {feed.events.length === 0 ? <Empty>No events.</Empty> : (
          <div className="table-wrap" style={{ maxHeight: 620, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Purpose</th><th>Outcome</th><th /></tr>
              </thead>
              <tbody>
                {feed.events.map((event) => (
                  <tr key={event.id}>
                    <td className="small mono" style={{ whiteSpace: 'nowrap' }}>{when(event.ts)}</td>
                    <td className="small">
                      {event.actor_name ?? <span className="muted">{event.actor_id ?? 'system'}</span>}
                      {event.actor_designation && <div className="tiny muted">{event.actor_designation}</div>}
                    </td>
                    <td className="small mono">{event.action}</td>
                    <td className="small">
                      {event.case_number
                        ? <Link to={`/cases/${event.case_id}`}>{event.case_number}</Link>
                        : <span className="muted">{event.resource_type ?? '-'}</span>}
                      {event.resource_id && <div className="tiny muted mono">{shortHash(event.resource_id, 12, 4)}</div>}
                    </td>
                    <td className="tiny">{event.purpose_code ?? <span className="muted">-</span>}</td>
                    <td>
                      <Chip tone={event.outcome === 'allow' ? 'ok' : event.outcome === 'deny' ? 'danger' : 'warn'}>
                        {event.outcome}
                      </Chip>
                      {event.outcome === 'deny' && typeof event.detail.ruleId === 'string' && (
                        <div className="tiny muted mono">{String(event.detail.ruleId)}</div>
                      )}
                    </td>
                    <td>
                      <button className="sm ghost" disabled={!event.batch_id} title={event.batch_id ? 'Show Merkle inclusion proof' : 'Not yet batched'}
                              onClick={() => api.get<Proof>(`/security/audit/${event.id}/proof`).then(setProof)}>
                        proof
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Anchored batches" sub="Millions of events collapse into a handful of transactions" tight>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Batch</th><th>Merkle root</th><th>Events</th><th>Sealed</th><th>Anchor</th></tr></thead>
            <tbody>
              {feed.batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="mono small">{batch.id}</td>
                  <td className="hash">{shortHash(batch.root, 18, 8)}</td>
                  <td className="num">{batch.event_count}</td>
                  <td className="small">{when(batch.created_at)}</td>
                  <td>{batch.anchor_id ? <Chip tone="ok">on chain</Chip> : <Chip tone="warn">pending</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {proof && <ProofModal proof={proof} onClose={() => setProof(null)} toast={toast} />}
    </div>
  );
}

function ProofModal({ proof, onClose, toast }: {
  proof: Proof; onClose: () => void; toast: ReturnType<typeof useApp>['toast'];
}) {
  const [checked, setChecked] = useState<{ valid: boolean; rootAnchored: boolean; message: string } | null>(null);

  if (proof.error) {
    return <Modal title="Inclusion proof" onClose={onClose}><Banner tone="warn" title="Not available">{proof.error}</Banner></Modal>;
  }

  return (
    <Modal
      title="Merkle inclusion proof"
      onClose={onClose}
      footer={<>
        <button className="ghost" onClick={onClose}>Close</button>
        <button className="primary" onClick={() => {
          api.post<typeof checked>('/public/verify/audit-proof', proof.proof).then((r) => {
            setChecked(r);
            toast(r!.valid ? 'ok' : 'danger', r!.valid ? 'Proof verified independently' : 'Proof invalid', r!.message);
          });
        }}>Verify via the public endpoint</button>
      </>}
    >
      <div className="stack">
        <Banner tone={proof.verified ? 'ok' : 'danger'} title={proof.verified ? 'Proof reconstructs the anchored root' : 'Proof does not verify'}>
          This single log line is provably a member of an anchored batch. It cannot have been inserted,
          removed or back-dated after the fact - and checking that needs only the {proof.proof.path.length} sibling
          hashes below, not the other {proof.proof.treeSize - 1} events.
        </Banner>

        <dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
          <dt>Event</dt><dd className="mono small">{proof.eventId}</dd>
          <dt>Batch</dt><dd className="mono small">{proof.batchId}</dd>
          <dt>Tree size</dt><dd className="num">{proof.proof.treeSize} events</dd>
          <dt>Leaf index</dt><dd className="num">{proof.proof.leafIndex}</dd>
          <dt>Proof size</dt><dd className="num">{proof.proof.path.length} hashes</dd>
        </dl>

        <div>
          <div className="tiny muted" style={{ marginBottom: 5 }}>LEAF - this event</div>
          <Hash value={proof.proof.leaf} />
        </div>

        <div>
          <div className="tiny muted" style={{ marginBottom: 5 }}>SIBLING PATH - hashed upward, in order</div>
          <div className="stack" style={{ gap: 5 }}>
            {proof.proof.path.map((step, index) => (
              <div className="proof-node" key={index}>
                <Chip tone="n">{step.position}</Chip>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.hash}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="tiny muted" style={{ marginBottom: 5 }}>ROOT - anchored on the ledger</div>
          <Hash value={proof.proof.root} />
        </div>

        {proof.anchor && (
          <dl className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
            <dt>Chain</dt><dd className="mono small">{proof.anchor.chain_id}</dd>
            <dt>Transaction</dt><dd className="mono small">{proof.anchor.tx_ref}</dd>
            <dt>Block</dt><dd className="num">{proof.anchor.block_number ?? '-'}</dd>
            <dt>Anchored</dt><dd className="small">{when(proof.anchor.created_at)}</dd>
          </dl>
        )}

        {checked && (
          <Banner tone={checked.valid ? 'ok' : 'danger'} title={checked.valid ? 'Independently verified' : 'Failed'}>
            {checked.message}
            {checked.rootAnchored && ' The root is present on the consortium ledger.'}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
