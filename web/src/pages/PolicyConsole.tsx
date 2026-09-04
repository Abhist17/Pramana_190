import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { Card, Chip, Banner, Loading, Hash } from '../components/ui.tsx';
import { when } from '../lib/format.ts';

type Rule = {
  id: string; effect: 'permit' | 'deny'; description: string; basis?: string;
  actions: string[]; when: unknown[]; obligations?: string[];
};
type PolicyResponse = {
  policy: { version: number; name: string; rules: Rule[] };
  policyHash: string;
  anchor: { tx_ref: string; block_number: number | null; created_at: string; chain_id: string } | null;
};
type Persona = { username: string; fullName: string; designation: string; role: string };
type CaseRow = { id: string; caseNumber: string; sensitiveMode: boolean };
type Simulation = {
  decision: { effect: string; ruleId: string; reason: string; obligations: string[]; policyVersion: number };
  trace: { id: string; effect: string; description: string; basis: string | null; matched: boolean;
           conditions: { expression: string; satisfied: boolean }[] }[];
  subject: { id: string; role: string; rankLevel: number; district: string; station: string | null;
             clearanceLevel: number; assignments: Record<string, string> };
};

const ACTIONS = [
  'case.read', 'document.read', 'document.download', 'document.create', 'document.certify',
  'document.share', 'document.export', 'bulk.export', 'document.dispose', 'audit.read',
  'vault.deanonymise', 'custody.transfer',
];

export default function PolicyConsole() {
  const [policy, setPolicy] = useState<PolicyResponse | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [userIds, setUserIds] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ username: '', caseId: '', action: 'document.read', purposeCode: 'INVESTIGATION', breakGlass: false });
  const [result, setResult] = useState<Simulation | null>(null);

  useEffect(() => {
    api.get<PolicyResponse>('/security/policy').then(setPolicy).catch(() => undefined);
    api.get<{ personas: Persona[] }>('/auth/personas').then((r) => {
      setPersonas(r.personas);
      setForm((current) => ({ ...current, username: r.personas[0]?.username ?? '' }));
    }).catch(() => undefined);
    api.get<{ cases: CaseRow[] }>('/cases').then((r) => {
      setCases(r.cases);
      setForm((current) => ({ ...current, caseId: r.cases[0]?.id ?? '' }));
    }).catch(() => undefined);
  }, []);

  // The simulator needs user ids, which /auth/personas deliberately does not expose;
  // resolve them by signing nothing - the server accepts a username lookup here.
  useEffect(() => {
    if (personas.length === 0) return;
    api.get<{ users: { id: string; username: string }[] }>('/security/users')
      .then((r) => setUserIds(Object.fromEntries(r.users.map((u) => [u.username, u.id]))))
      .catch(() => undefined);
  }, [personas]);

  if (!policy) return <Loading what="Loading access policy" />;

  const simulate = () => {
    const userId = userIds[form.username];
    if (!userId) return;
    api.post<Simulation>('/security/policy/simulate', {
      userId, caseId: form.caseId, action: form.action,
      purposeCode: form.purposeCode || null, breakGlass: form.breakGlass,
    }).then(setResult).catch(() => setResult(null));
  };

  return (
    <div className="stack">
      <div>
        <h1>Access policy</h1>
        <div className="muted small">
          Rules are data, not code. A change in the law is a policy edit and a new anchored version - not a release.
        </div>
      </div>

      <Banner tone="info" title={`Policy v${policy.policy.version} · ${policy.policy.rules.length} rules · deny-overrides with an implicit final deny`}>
        The hash of the active policy set is anchored with its effective period. That is what lets us
        prove, in a hearing years later, exactly which rules governed a specific access on a specific
        day - closing an argument the defence would otherwise open.
        <div style={{ marginTop: 8 }}><Hash value={policy.policyHash} /></div>
        {policy.anchor && (
          <div className="tiny mono" style={{ marginTop: 6, opacity: .85 }}>
            anchored {when(policy.anchor.created_at)} · block {policy.anchor.block_number ?? '-'} · {policy.anchor.chain_id}
          </div>
        )}
      </Banner>

      <Card title="Policy simulator" sub="Pick anyone, any resource, any action - see every rule that fires and why">
        <div className="grid c4" style={{ alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Officer</label>
            <select value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}>
              {personas.map((persona) => (
                <option key={persona.username} value={persona.username}>
                  {persona.fullName} - {persona.designation}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Case</label>
            <select value={form.caseId} onChange={(e) => setForm({ ...form, caseId: e.target.value })}>
              {cases.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.caseNumber}{row.sensitiveMode ? ' (sensitive)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Action</label>
            <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              {ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Purpose</label>
            <select value={form.purposeCode} onChange={(e) => setForm({ ...form, purposeCode: e.target.value })}>
              <option value="INVESTIGATION">INVESTIGATION</option>
              <option value="SUPERVISION">SUPERVISION</option>
              <option value="PROSECUTION">PROSECUTION</option>
              <option value="COURT_PRODUCTION">COURT_PRODUCTION</option>
              <option value="RECORDS">RECORDS</option>
              <option value="AUDIT">AUDIT</option>
              <option value="">(none - omit the purpose code)</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="row" style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: 13, gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.breakGlass}
                   onChange={(e) => setForm({ ...form, breakGlass: e.target.checked })} />
            Break-glass emergency override
          </label>
          <div className="spacer" style={{ flex: 1 }} />
          <button className="primary" onClick={simulate} disabled={!userIds[form.username]}>Evaluate</button>
        </div>

        {result && (
          <>
            <div className="divider" />
            <Banner tone={result.decision.effect === 'permit' ? 'ok' : 'danger'}
                    title={`${result.decision.effect.toUpperCase()} - ${result.decision.ruleId}`}>
              {result.decision.reason}
              {result.decision.obligations.length > 0 && (
                <div className="row" style={{ gap: 5, marginTop: 8 }}>
                  {result.decision.obligations.map((obligation) => <Chip key={obligation} tone="a">{obligation}</Chip>)}
                </div>
              )}
            </Banner>

            <div className="divider" />
            <h4 className="muted" style={{ marginBottom: 9 }}>EVALUATION TRACE</h4>
            <div className="stack" style={{ gap: 8 }}>
              {result.trace.map((rule) => (
                <div key={rule.id} className="card" style={{
                  boxShadow: 'none',
                  borderColor: rule.matched ? (rule.effect === 'deny' ? 'var(--danger)' : 'var(--ok)') : 'var(--line)',
                  opacity: rule.matched ? 1 : .62,
                }}>
                  <div className="body" style={{ padding: 11 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <Chip tone={rule.effect === 'deny' ? 'danger' : 'ok'}>{rule.effect}</Chip>
                      <span className="mono small" style={{ fontWeight: 650 }}>{rule.id}</span>
                      {rule.matched && <Chip tone="warn">matched</Chip>}
                    </div>
                    <div className="tiny muted" style={{ marginTop: 5 }}>{rule.description}</div>
                    {rule.basis && <div className="tiny mono muted" style={{ marginTop: 3 }}>basis: {rule.basis}</div>}
                    <div className="stack" style={{ gap: 3, marginTop: 7 }}>
                      {rule.conditions.map((condition, index) => (
                        <div key={index} className="row" style={{ gap: 6 }}>
                          <span style={{ color: condition.satisfied ? 'var(--ok)' : 'var(--muted)' }}>
                            {condition.satisfied ? '✓' : '✕'}
                          </span>
                          <span className="mono tiny">{condition.expression}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Installed rules" tight>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Effect</th><th>Rule</th><th>Actions</th><th>Basis</th></tr></thead>
            <tbody>
              {policy.policy.rules.map((rule) => (
                <tr key={rule.id}>
                  <td><Chip tone={rule.effect === 'deny' ? 'danger' : 'ok'}>{rule.effect}</Chip></td>
                  <td>
                    <div className="mono small" style={{ fontWeight: 650 }}>{rule.id}</div>
                    <div className="tiny muted" style={{ maxWidth: 560 }}>{rule.description}</div>
                  </td>
                  <td className="tiny mono">{rule.actions.join(', ')}</td>
                  <td className="tiny muted">{rule.basis ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
