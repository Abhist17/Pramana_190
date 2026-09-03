import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useApp, denialMessage } from '../lib/app.tsx';
import { Card, Chip, Banner, Loading, Meter, Empty, Tabs, Modal } from '../components/ui.tsx';
import { when, sensitivity, bytes, deadlineTone, shortHash } from '../lib/format.ts';

type Doc = {
  id: string; title: string; docClass: string; docType: string; sensitivity: number;
  language: string; mimeType: string; sizeBytes: number; hash: { algorithm: string; value: string };
  version: number; createdAt: string; integrityStatus: string; sealedCover: boolean;
  renditionType: string | null; legalHold: boolean; retentionClass: string;
};
type Detail = {
  case: { id: string; caseNumber: string; title: string; station: string; district: string; sections: string[];
          offenceCategory: string; sensitivity: number; sensitiveMode: boolean; status: string;
          registeredAt: string; victimPseudonym: string | null };
  documents: Doc[]; allDocuments: Doc[];
  assignments: { id: string; full_name: string; designation: string; role: string; assigned_at: string }[];
  deadlines: { id: string; kind: string; statuteRef: string; description: string; dueAt: string;
               status: string; daysRemaining: number; percentElapsed: number; escalateToRank: number | null }[];
  vault: { id: string; pseudonym: string; subject_kind: string }[];
  entities: { type: string; value: string; normalised: string; mentions: number; confidence: number; verified: number }[];
  completeness: { required: { docType: string; label: string; basis: string }[]; present: string[];
                  missing: { docType: string; label: string; basis: string }[]; percent: number };
  timeline: { at: string; kind: string; label: string; ref: string }[];
  sectionsAssessment: { sensitive: boolean; category: string; matched: string[] };
};

type Tab = 'documents' | 'timeline' | 'deadlines' | 'entities' | 'people';

export default function CaseWorkspace() {
  const { caseId } = useParams();
  const { purpose, toast } = useApp();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [denial, setDenial] = useState<{ title: string; body: string; ruleId?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('documents');
  const [upload, setUpload] = useState(false);

  const load = useCallback(() => {
    setDenial(null);
    api.get<Detail>(`/cases/${caseId}?purpose=${purpose}`)
      .then(setDetail)
      .catch((error) => { setDetail(null); setDenial(denialMessage(error)); });
  }, [caseId, purpose]);

  useEffect(load, [load]);

  if (denial) {
    return (
      <div className="stack">
        <Link to="/cases" className="small">← All cases</Link>
        <Banner tone="danger" title={denial.title}>
          {denial.body}
          {denial.ruleId && <div className="mono tiny" style={{ marginTop: 7 }}>rule: {denial.ruleId}</div>}
          <div className="tiny" style={{ marginTop: 7, opacity: .85 }}>
            This denial has been written to the audit trail, with your identity, the purpose you selected
            and the rule that refused you.
          </div>
        </Banner>
      </div>
    );
  }
  if (!detail) return <Loading what="Opening case" />;

  const c = detail.case;
  const level = sensitivity(c.sensitivity);

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <Link to="/cases" className="small">← All cases</Link>
          <h1 style={{ marginTop: 5 }}>{c.caseNumber}</h1>
          <div className="muted small">{c.title}</div>
        </div>
        <div className="row">
          <Chip tone={level.chip}>L{c.sensitivity} {level.label}</Chip>
          {c.sensitiveMode && <Chip tone="warn">Women Safety Mode</Chip>}
          <button className="primary" onClick={() => setUpload(true)}>Capture document</button>
        </div>
      </div>

      {c.sensitiveMode && (
        <Banner tone="warn" title="Sensitive Case Mode is active — escalated automatically on registration">
          This case does not appear in station-wide listings. Rank alone grants nothing: access requires
          explicit assignment. Every view is watermarked, bulk export and print are disabled, and the
          complainant appears everywhere as{' '}
          <strong className="mono">{c.victimPseudonym ?? 'a pseudonym'}</strong> — her name is not in any
          working document.
          {detail.sectionsAssessment.matched.length > 0 && (
            <div className="tiny" style={{ marginTop: 6 }}>
              Triggered by: {detail.sectionsAssessment.matched.join('; ')}
            </div>
          )}
        </Banner>
      )}

      <div className="grid c4">
        <Card title="File completeness" sub={`${detail.completeness.percent}% of the required set`}>
          <Meter value={detail.completeness.percent / 100}
                 tone={detail.completeness.percent === 100 ? 'ok' : detail.completeness.percent > 60 ? 'warn' : 'danger'} />
          <div className="tiny muted" style={{ marginTop: 8 }}>
            {detail.completeness.missing.length === 0
              ? 'Every document this offence class requires is present.'
              : `Missing: ${detail.completeness.missing.map((m) => m.label).join(', ')}`}
          </div>
        </Card>
        <Card title="Documents"><div style={{ fontSize: 26, fontWeight: 700 }}>{detail.documents.length}</div>
          <div className="tiny muted">{detail.allDocuments.length} including superseded versions</div></Card>
        <Card title="Sections"><div className="small">{c.sections.join(', ')}</div>
          <div className="tiny muted" style={{ marginTop: 5 }}>{c.offenceCategory.replace(/_/g, ' ')}</div></Card>
        <Card title="Registered"><div className="small">{when(c.registeredAt)}</div>
          <div className="tiny muted" style={{ marginTop: 5 }}>{c.station}, {c.district}</div></Card>
      </div>

      <Card tight>
        <Tabs<Tab>
          value={tab} onChange={setTab}
          tabs={[
            { id: 'documents', label: `Documents (${detail.documents.length})` },
            { id: 'timeline', label: 'Chronology' },
            { id: 'deadlines', label: `Deadlines (${detail.deadlines.filter((d) => d.status === 'open').length})` },
            { id: 'entities', label: `Entities (${detail.entities.length})` },
            { id: 'people', label: 'People & vault' },
          ]}
        />
        <div style={{ padding: tab === 'documents' ? 0 : 16 }}>
          {tab === 'documents' && <DocumentTable documents={detail.documents} />}
          {tab === 'timeline' && (
            <div className="timeline">
              {detail.timeline.map((event, index) => (
                <div className="ev" key={`${event.ref}-${index}`}>
                  <div className="when">{when(event.at)}</div>
                  <div className="what">{event.label}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'deadlines' && <DeadlineList deadlines={detail.deadlines} onDone={load} toast={toast} />}
          {tab === 'entities' && (
            detail.entities.length === 0 ? <Empty>No entities extracted yet.</Empty> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Type</th><th>Value</th><th>Mentions</th><th>Confidence</th><th>State</th></tr></thead>
                  <tbody>
                    {detail.entities.map((entity) => (
                      <tr key={`${entity.type}-${entity.normalised}`}>
                        <td><Chip tone="n">{entity.type}</Chip></td>
                        <td className="mono small">{entity.value}</td>
                        <td className="num">{entity.mentions}</td>
                        <td className="num small">{Math.round(entity.confidence * 100)}%</td>
                        <td>{entity.verified
                          ? <Chip tone="ok">human verified</Chip>
                          : <Chip tone="warn">machine-generated</Chip>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {tab === 'people' && (
            <div className="grid c2">
              <div>
                <h4 className="muted" style={{ marginBottom: 9 }}>ASSIGNED</h4>
                <div className="stack" style={{ gap: 7 }}>
                  {detail.assignments.map((person) => (
                    <div key={person.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <div className="small" style={{ fontWeight: 600 }}>{person.full_name}</div>
                        <div className="tiny muted">{person.designation}</div>
                      </div>
                      <Chip tone="a">{person.role}</Chip>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="muted" style={{ marginBottom: 9 }}>IDENTITY VAULT</h4>
                {detail.vault.length === 0 ? <div className="small muted">No protected identities on this case.</div> : (
                  <div className="stack" style={{ gap: 7 }}>
                    {detail.vault.map((entry) => (
                      <div key={entry.id} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="mono small">{entry.pseudonym}</span>
                        <Chip tone="seal">{entry.subject_kind.replace(/_/g, ' ')}</Chip>
                      </div>
                    ))}
                    <div className="tiny muted">
                      Real particulars are encrypted separately. Revealing one needs dual authorisation,
                      a written justification and a waiting period — see the Women Safety console.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {upload && <UploadModal caseId={c.id} sensitiveMode={c.sensitiveMode} onClose={() => setUpload(false)}
                              onDone={() => { setUpload(false); load(); }} />}
    </div>
  );
}

function DocumentTable({ documents }: { documents: Doc[] }) {
  if (documents.length === 0) return <Empty>No documents in this case yet.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Document</th><th>Type</th><th>Fingerprint</th><th>Integrity</th><th>Sealed</th></tr></thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <Link to={`/documents/${doc.id}`} style={{ fontWeight: 600 }}>{doc.title}</Link>
                <div className="tiny muted">
                  v{doc.version} · {bytes(doc.sizeBytes)} · {doc.language}
                  {doc.renditionType && ` · ${doc.renditionType} rendition`}
                </div>
              </td>
              <td className="small">{doc.docType.replace(/_/g, ' ')}</td>
              <td><span className="hash">{shortHash(doc.hash.value, 12, 8)}</span></td>
              <td>
                <div className="row" style={{ gap: 4 }}>
                  {doc.integrityStatus === 'compromised'
                    ? <Chip tone="danger">ALTERED</Chip>
                    : <Chip tone="ok">{doc.integrityStatus}</Chip>}
                  {doc.sealedCover && <Chip tone="seal">sealed cover</Chip>}
                  {doc.legalHold && <Chip tone="warn">legal hold</Chip>}
                </div>
              </td>
              <td className="small">{when(doc.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeadlineList({ deadlines, onDone, toast }: {
  deadlines: Detail['deadlines']; onDone: () => void; toast: ReturnType<typeof useApp>['toast'];
}) {
  if (deadlines.length === 0) return <Empty>No statutory deadlines computed for this case.</Empty>;
  return (
    <div className="stack">
      {deadlines.map((deadline) => {
        const tone = deadline.status === 'met' ? 'ok' : deadlineTone(deadline.percentElapsed);
        return (
          <div key={deadline.id} className="card" style={{ boxShadow: 'none' }}>
            <div className="body">
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <strong>{deadline.kind.replace(/_/g, ' ')}</strong>
                    <Chip tone={tone}>{deadline.status}</Chip>
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>{deadline.description}</div>
                  <div className="tiny mono muted" style={{ marginTop: 4 }}>{deadline.statuteRef}</div>
                </div>
                {deadline.status === 'open' && (
                  <button className="sm" onClick={() => {
                    const reason = deadline.percentElapsed >= 1
                      ? window.prompt('This deadline has passed. Record the reason for delay — it becomes part of the permanent case record.') ?? undefined
                      : undefined;
                    api.post(`/security/deadlines/${deadline.id}/complete`, { delayReason: reason })
                      .then(() => { toast('ok', 'Deadline marked complete'); onDone(); })
                      .catch((error) => toast('danger', 'Could not update', String(error)));
                  }}>Mark complete</button>
                )}
              </div>
              <div style={{ marginTop: 10 }}>
                <Meter value={deadline.percentElapsed} tone={tone} />
                <div className="row tiny muted" style={{ marginTop: 5, justifyContent: 'space-between' }}>
                  <span>{Math.round(deadline.percentElapsed * 100)}% elapsed</span>
                  <span>
                    due {when(deadline.dueAt)}
                    {deadline.daysRemaining < 0
                      ? ` · ${Math.abs(deadline.daysRemaining)} days overdue`
                      : ` · ${deadline.daysRemaining} days left`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const DOC_TYPES = [
  ['case_diary', 'Case diary'], ['witness_statement', 'Witness statement'],
  ['victim_statement', 'Victim statement (woman officer required in sensitive cases)'],
  ['seizure_memo', 'Seizure memo'], ['arrest_memo', 'Arrest memo'], ['site_plan', 'Site plan'],
  ['scene_photograph', 'Scene photograph'], ['medical_report', 'Medical examination report'],
  ['fsl_report', 'FSL report'], ['chargesheet', 'Charge sheet'], ['correspondence', 'Correspondence'],
];

function UploadModal({ caseId, sensitiveMode, onClose, onDone }: {
  caseId: string; sensitiveMode: boolean; onClose: () => void; onDone: () => void;
}) {
  const { toast, purpose } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('case_diary');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    const form = new FormData();
    form.append('caseId', caseId);
    form.append('title', title || file.name);
    form.append('docType', docType);
    form.append('docClass', docType.includes('statement') ? 'statement' : docType.includes('report') ? 'forensic' : 'investigation');
    form.append('purpose', purpose);
    form.append('captureMeta', JSON.stringify({
      source: 'web-console', capturedAt: new Date().toISOString(),
      userAgent: navigator.userAgent.slice(0, 90),
    }));
    form.append('file', file);
    try {
      const result = await api.upload<{ documentId: string; hash: { value: string }; blockNumber: number | null; message: string }>('/documents', form);
      toast('ok', 'Sealed and anchored', result.message);
      onDone();
    } catch (caught) {
      setError(denialMessage(caught) ?? { title: 'Upload failed', body: String(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Capture and seal a document"
      onClose={onClose}
      footer={<>
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!file || busy} onClick={submit}>
          {busy ? 'Sealing…' : 'Hash, encrypt, sign and anchor'}
        </button>
      </>}
    >
      {error && <div style={{ marginBottom: 13 }}><Banner tone="danger" title={error.title}>{error.body}</Banner></div>}
      <div className="field">
        <label>File</label>
        <input type="file" onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          setFile(picked);
          if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ''));
        }} />
      </div>
      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Witness statement — …" />
      </div>
      <div className="field">
        <label>Document type</label>
        <select value={docType} onChange={(e) => setDocType(e.target.value)}>
          {DOC_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {sensitiveMode && docType === 'victim_statement' && (
        <Banner tone="warn" title="Statutory role check applies">
          In a sensitive case this statement class may only be created by a woman police officer.
          If your account does not carry that attribute the upload is refused at this point — and the
          attempt is logged.
        </Banner>
      )}
      <div className="tiny muted" style={{ marginTop: 12, lineHeight: 1.6 }}>
        On submit the file is fingerprinted with SHA-256, encrypted under a fresh per-document key,
        signed with your credential, and its fingerprint written to the consortium ledger — in that
        order, before it is stored.
      </div>
    </Modal>
  );
}
