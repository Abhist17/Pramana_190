import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useApp, denialMessage } from '../lib/app.tsx';
import { Card, Chip, Banner, Loading, Empty, Meter, Modal } from '../components/ui.tsx';
import { when, deadlineTone } from '../lib/format.ts';

type Overview = {
  /** 'national' for DSP and above; 'assigned' for an officer's own sensitive cases. */
  scope: 'national' | 'assigned';
  cases: { id: string; caseNumber: string; title: string; district: string; station: string;
           offenceCategory: string; sensitivity: number; victim: string | null; registeredAt: string }[];
  deadlines: { id: string; caseId: string; caseNumber?: string; kind: string; statuteRef: string;
               dueAt: string; daysRemaining: number; percentElapsed: number; escalateToRank: number | null }[];
  heatmap: { district: string; cases: number; breachedDeadlines: number; criticalDeadlines: number }[];
  vaultRequests: { id: string; vault_id: string; case_id: string; requested_by: string; reason: string;
                   status: string; approvals: string; required_approvals: number; requested_at: string; available_at: string }[];
  triggers: { pattern: string; category: string; label: string }[];
  womanOfficerRequiredTypes: string[];
};

export default function WomenSafety() {
  const { toast, user } = useApp();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<{ caseId: string; caseNumber: string } | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<Overview>('/wsd/overview')
      .then(setData)
      .catch((caught) => setError(denialMessage(caught)?.body || String(caught)));
  }, []);
  useEffect(load, [load]);

  if (!data) return <Loading what="Loading Women Safety console" error={error} onRetry={load} />;

  return (
    <div className="stack">
      <div>
        <h1>Women Safety Division</h1>
        <div className="muted small">
          Sexual offences, offences against children, trafficking and domestic violence - the most
          sensitive class of case file in Indian policing.
        </div>
        <div className="row" style={{ gap: 7, marginTop: 9 }}>
          <Chip tone={data.scope === 'national' ? 'a' : 'n'}>
            {data.scope === 'national' ? 'Division oversight - all districts' : 'Your assigned cases only'}
          </Chip>
          {data.scope === 'assigned' && (
            <span className="tiny muted">
              Rank does not widen this view; explicit case assignment does. Officers of DSP rank and
              above see the national console.
            </span>
          )}
        </div>
      </div>

      <Banner tone="seal" title="An officer cannot leak what the system never showed him">
        Every complainant below appears only as a pseudonym. Her identifying particulars are not in any
        working document, index entry, search result, notification or export - they are encrypted in a
        separate vault. Revealing one is a distinct privileged operation requiring dual authorisation, a
        written justification and a waiting period, and it is anchored on chain as its own event.
      </Banner>

      <div className="grid c3">
        {data.heatmap.map((district) => (
          <Card key={district.district} title={district.district} sub={`${district.cases} sensitive case${district.cases === 1 ? '' : 's'}`}>
            <div className="row" style={{ gap: 7 }}>
              <Chip tone={district.breachedDeadlines ? 'danger' : 'ok'}>
                {district.breachedDeadlines} deadlines breached
              </Chip>
              {district.criticalDeadlines > 0 && <Chip tone="warn">{district.criticalDeadlines} critical</Chip>}
            </div>
          </Card>
        ))}
      </div>

      <Card title="Sensitive cases" sub="Escalated automatically on registration - no officer has to remember" tight>
        {data.cases.length === 0 ? (
          <Empty>{data.scope === 'assigned'
            ? 'You are not assigned to any sensitive case. Assignment - not rank - is what opens these files.'
            : 'No sensitive cases.'}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Case</th><th>Category</th><th>Complainant</th><th>Station</th><th>Registered</th><th /></tr></thead>
              <tbody>
                {data.cases.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={`/cases/${row.id}`} style={{ fontWeight: 600 }}>{row.caseNumber}</Link>
                      <div className="tiny muted">{row.title}</div>
                    </td>
                    <td><Chip tone="warn">{row.offenceCategory.replace(/_/g, ' ')}</Chip></td>
                    <td><span className="mono small">{row.victim ?? '-'}</span></td>
                    <td className="small">{row.station}<div className="tiny muted">{row.district}</div></td>
                    <td className="small">{when(row.registeredAt)}</td>
                    <td>
                      <button className="sm" onClick={() => setRequesting({ caseId: row.id, caseNumber: row.caseNumber })}>
                        Request identity
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid split">
        <Card title="Statutory countdown" sub="Sexual offence investigations carry a compressed deadline" tight>
          {data.deadlines.length === 0 ? <Empty>No open deadlines.</Empty> : (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Case</th><th>Obligation</th><th style={{ width: 140 }}>Elapsed</th><th>Escalation</th></tr></thead>
                <tbody>
                  {data.deadlines.slice(0, 20).map((deadline) => {
                    const tone = deadlineTone(deadline.percentElapsed);
                    return (
                      <tr key={deadline.id}>
                        <td className="small"><Link to={`/cases/${deadline.caseId}`}>{deadline.caseNumber}</Link></td>
                        <td className="small">{deadline.kind.replace(/_/g, ' ')}
                          <div className="tiny muted mono">{deadline.statuteRef}</div></td>
                        <td>
                          <Meter value={deadline.percentElapsed} tone={tone} />
                          <div className="tiny muted" style={{ marginTop: 3 }}>
                            {deadline.daysRemaining < 0 ? `${Math.abs(deadline.daysRemaining)}d overdue` : `${deadline.daysRemaining}d left`}
                          </div>
                        </td>
                        <td>{deadline.escalateToRank
                          ? <Chip tone={tone}>L{deadline.escalateToRank}</Chip>
                          : <span className="muted tiny">-</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Identity-vault requests" sub="Every request visible to supervisors during the wait" tight>
            {data.vaultRequests.length === 0 ? <Empty>No requests.</Empty> : (
              <div>
                {data.vaultRequests.map((request) => {
                  const approvals = (JSON.parse(request.approvals || '[]') as string[]);
                  const waitOver = new Date(request.available_at) <= new Date();
                  return (
                    <div key={request.id} style={{ padding: '11px 16px', borderBottom: '1px solid var(--line)' }}>
                      <div className="row" style={{ gap: 7 }}>
                        <Chip tone={request.status === 'approved' ? 'ok' : request.status === 'fulfilled' ? 'seal' : 'warn'}>
                          {request.status}
                        </Chip>
                        <span className="tiny muted">{approvals.length}/{request.required_approvals} approvals</span>
                        <span className="tiny muted">{waitOver ? 'wait elapsed' : `wait until ${when(request.available_at)}`}</span>
                      </div>
                      <div className="small" style={{ marginTop: 5 }}>{request.reason}</div>
                      <div className="row" style={{ gap: 6, marginTop: 7 }}>
                        {request.status === 'pending' && (
                          <button className="sm" onClick={() => api.post(`/wsd/vault/request/${request.id}/approve`)
                            .then((r) => { toast('ok', 'Approval recorded', JSON.stringify(r)); load(); })
                            .catch((error) => toast('danger', 'Refused', denialMessage(error)?.body ?? String(error)))}>
                            Approve
                          </button>
                        )}
                        {request.status === 'approved' && (
                          <button className="sm danger" onClick={() => api.post<{ pseudonym: string; subject: Record<string, unknown> }>(`/wsd/vault/request/${request.id}/reveal`)
                            .then((r) => { toast('danger', `Identity revealed for ${r.pseudonym}`, JSON.stringify(r.subject)); load(); })
                            .catch((error) => toast('danger', 'Refused', denialMessage(error)?.body ?? String(error)))}>
                            Reveal identity
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Automatic escalation triggers" sub="Sections that force Sensitive Case Mode">
            <div className="stack" style={{ gap: 6 }}>
              {data.triggers.map((trigger) => (
                <div key={trigger.label} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small">{trigger.label}</span>
                  <Chip tone="n">{trigger.category.replace(/_/g, ' ')}</Chip>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="tiny muted">
              Escalation is automatic; de-escalation needs DSP rank and a recorded reason. Errors fail
              towards protection.
            </div>
          </Card>

          <Card title="Statutory role enforcement" sub="Enforced at upload, not found in an audit months later">
            <div className="small" style={{ marginBottom: 8 }}>
              These document classes may only be created by a woman police officer in a sensitive case:
            </div>
            <div className="row" style={{ gap: 5 }}>
              {data.womanOfficerRequiredTypes.map((type) => <Chip key={type} tone="a">{type.replace(/_/g, ' ')}</Chip>)}
            </div>
            <div className="divider" />
            <div className="tiny muted">
              Your account {user!.isWomanOfficer
                ? 'carries the woman-officer attribute - you may record these statements.'
                : 'does not carry the woman-officer attribute; attempts to create these are blocked and logged.'}
            </div>
          </Card>
        </div>
      </div>

      {requesting && <RequestModal info={requesting} onClose={() => setRequesting(null)}
                                   onDone={() => { setRequesting(null); load(); }} />}
    </div>
  );
}

function RequestModal({ info, onClose, onDone }: {
  info: { caseId: string; caseNumber: string }; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useApp();
  const [reason, setReason] = useState('');
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ entries: { id: string; pseudonym: string }[] }>(`/wsd/vault/${info.caseId}`)
      .then((r) => setVaultId(r.entries[0]?.id ?? null))
      .catch((caught) => setError(denialMessage(caught)?.body ?? String(caught)));
  }, [info.caseId]);

  return (
    <Modal
      title={`Request de-anonymisation - ${info.caseNumber}`}
      onClose={onClose}
      footer={<>
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button className="danger" disabled={busy || !vaultId || reason.trim().length < 20} onClick={async () => {
          setBusy(true); setError(null);
          try {
            const result = await api.post<{ requestId: string; availableAt: string; message: string }>(
              '/wsd/vault/request', { vaultId, reason });
            toast('warn' as 'danger', 'Request recorded and anchored', result.message);
            onDone();
          } catch (caught) {
            setError(denialMessage(caught)?.body ?? String(caught));
          } finally { setBusy(false); }
        }}>Submit request</button>
      </>}
    >
      <Banner tone="warn" title="This grants you nothing on its own">
        Two approvals from officers of DSP rank or above are required, you cannot approve your own
        request, and a waiting period runs during which every supervisor is notified - so an
        illegitimate request is visible before it can succeed. The request itself is anchored on chain.
      </Banner>
      <div className="field" style={{ marginTop: 14 }}>
        <label>Written justification (minimum 20 characters - becomes part of the permanent record)</label>
        <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Identity required in order to…" />
      </div>
      {error && <Banner tone="danger" title="Refused">{error}</Banner>}
      {!vaultId && !error && <div className="small muted">No protected identity is recorded on this case.</div>}
    </Modal>
  );
}
