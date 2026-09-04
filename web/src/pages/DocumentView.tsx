import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../lib/api.ts';
import { useApp, denialMessage } from '../lib/app.tsx';
import { Card, Chip, Banner, Loading, Empty, Tabs, Hash, HashDiff } from '../components/ui.tsx';
import { when, sensitivity, bytes, shortHash } from '../lib/format.ts';

type Verification = {
  status: 'verified' | 'compromised' | 'missing'; expectedHash: string; actualHash: string | null;
  algorithm: string; anchored: boolean; txRef: string | null; blockNumber: number | null;
  anchoredAt: string | null; checkedAt: string; detail: string;
};
type Detail = {
  document: {
    id: string; caseId: string; title: string; docClass: string; docType: string; sensitivity: number;
    language: string; mimeType: string; sizeBytes: number; hash: { algorithm: string; value: string };
    version: number; createdAt: string; createdBy: string; integrityStatus: string; sealedCover: boolean;
    captureMeta: Record<string, unknown>; retentionClass: string; disposalDue: string | null;
    legalHold: boolean; renditionType: string | null; signed: boolean;
  };
  case: { id: string; caseNumber: string; sensitiveMode: boolean };
  versions: Detail['document'][]; renditions: Detail['document'][];
  custody: { id: string; action: string; created_at: string; reason: string; from_name: string | null;
             to_name: string | null; item_hash: string; anchor_id: string | null; received_sig: string | null }[];
  certificates: { id: string; status: string; created_at: string }[];
  anchor: { id: string; tx_ref: string; block_number: number | null; chain_id: string; contract: string; created_at: string } | null;
  derivedText: { text: string; language: string; engine: string; confidence: number;
                 machineGenerated: boolean; humanVerified: boolean; needsVerification: boolean } | null;
  entities: { id: string; type: string; value: string; confidence: number; verified: number }[];
  watermark: string;
  obligations: string[];
  retention: { label: string; note: string } | null;
};

type Tab = 'content' | 'integrity' | 'custody' | 'versions' | 'certificate' | 'redaction';

export default function DocumentView() {
  const { documentId } = useParams();
  const { purpose, toast } = useApp();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [denial, setDenial] = useState<{ title: string; body: string; ruleId?: string } | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [tab, setTab] = useState<Tab>('content');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setDenial(null);
    api.get<Detail>(`/documents/${documentId}?purpose=${purpose}`)
      .then(setDetail)
      .catch((error) => { setDetail(null); setDenial(denialMessage(error)); });
  }, [documentId, purpose]);

  useEffect(load, [load]);

  const verify = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api.get<Verification>(`/documents/${documentId}/verify`);
      setVerification(result);
      setTab('integrity');
      toast(result.status === 'verified' ? 'ok' : 'danger',
            result.status === 'verified' ? 'Integrity verified' : 'INTEGRITY FAILURE', result.detail);
      load();
    } catch (error) {
      toast('danger', 'Verification failed', String(error));
    } finally { setBusy(false); }
  }, [documentId, toast, load]);

  if (denial) {
    return (
      <div className="stack">
        <Link to="/cases" className="small">← Cases</Link>
        <Banner tone={denial.ruleId === 'deny-sealed-cover-direct-read' ? 'seal' : 'danger'} title={denial.title}>
          {denial.body}
          {denial.ruleId && <div className="mono tiny" style={{ marginTop: 7 }}>rule: {denial.ruleId}</div>}
        </Banner>
        {denial.ruleId === 'deny-sealed-cover-direct-read' && (
          <Card title="This document is under threshold custody">
            <p className="small">
              Its data key was split with Shamir's scheme across designated custodians. No single
              individual - the system administrator included - holds enough to decrypt it. Opening it
              requires m-of-n approvals and an enforced waiting period during which every custodian is
              notified, so an illegitimate request is visible before it succeeds.
            </p>
            <Link className="btn sm" to="/women-safety">Request an unseal →</Link>
          </Card>
        )}
      </div>
    );
  }
  if (!detail) return <Loading what="Opening document" />;

  const doc = detail.document;
  const level = sensitivity(doc.sensitivity);
  const compromised = doc.integrityStatus === 'compromised' || verification?.status === 'compromised';

  return (
    <div className="stack">
      <div className="spread">
        <div style={{ minWidth: 0 }}>
          <Link to={`/cases/${doc.caseId}`} className="small">← {detail.case.caseNumber}</Link>
          <h1 style={{ marginTop: 5 }}>{doc.title}</h1>
          <div className="muted small">
            {doc.docType.replace(/_/g, ' ')} · v{doc.version} · {bytes(doc.sizeBytes)} · {doc.language}
            {doc.renditionType && ` · ${doc.renditionType} rendition`}
          </div>
        </div>
        <div className="row">
          <Chip tone={level.chip}>L{doc.sensitivity} {level.label}</Chip>
          <button onClick={verify} disabled={busy}>{busy ? 'Verifying…' : 'Verify integrity'}</button>
        </div>
      </div>

      {compromised && (
        <Banner tone="danger" alarm title="This document has been altered since it was sealed">
          The fingerprint recomputed from storage does not match the value anchored on the consortium
          ledger at seal time. The object is locked, the CISO and the case supervisor have been alerted,
          and an incident is open. <strong>The ledger entry did not change and cannot be changed.</strong>
        </Banner>
      )}

      <div className="grid split">
        <Card tight>
          <Tabs<Tab>
            value={tab} onChange={setTab}
            tabs={[
              { id: 'content', label: 'Content' },
              { id: 'integrity', label: 'Integrity' },
              { id: 'custody', label: `Custody (${detail.custody.length})` },
              { id: 'versions', label: `Versions (${detail.versions.length})` },
              { id: 'certificate', label: 'Evidence certificate' },
              { id: 'redaction', label: 'Redaction' },
            ]}
          />
          <div style={{ padding: 16 }}>
            {tab === 'content' && <Content detail={detail} />}
            {tab === 'integrity' && <Integrity detail={detail} verification={verification} onVerify={verify} onChanged={load} />}
            {tab === 'custody' && <Custody detail={detail} />}
            {tab === 'versions' && <Versions detail={detail} />}
            {tab === 'certificate' && <Certificate detail={detail} onChanged={load} />}
            {tab === 'redaction' && <Redaction detail={detail} onChanged={load} />}
          </div>
        </Card>

        <div className="stack">
          <Card title="Seal record">
            <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
              <dt>Algorithm</dt><dd className="mono">{doc.hash.algorithm}</dd>
              <dt>Fingerprint</dt><dd><Hash value={doc.hash.value} /></dd>
              <dt>Sealed at</dt><dd>{when(doc.createdAt)}</dd>
              <dt>Signature</dt><dd>{doc.signed
                ? <Chip tone="ok">SIMULATED-DSC (Ed25519)</Chip>
                : <Chip tone="warn">unsigned</Chip>}</dd>
              <dt>Retention</dt><dd className="small">{detail.retention?.label ?? doc.retentionClass}
                {doc.disposalDue && <div className="tiny muted">disposal due {when(doc.disposalDue)}</div>}</dd>
            </dl>
          </Card>

          {detail.anchor && (
            <Card title="Ledger anchor" sub="Proof only - no content ever reaches the chain">
              <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
                <dt>Contract</dt><dd className="mono small">{detail.anchor.contract}</dd>
                <dt>Chain</dt><dd className="mono small">{detail.anchor.chain_id}</dd>
                <dt>Transaction</dt><dd className="mono small">{shortHash(detail.anchor.tx_ref, 14, 6)}</dd>
                <dt>Block</dt><dd className="num">{detail.anchor.block_number ?? 'pending'}</dd>
                <dt>Anchored</dt><dd className="small">{when(detail.anchor.created_at)}</dd>
              </dl>
            </Card>
          )}

          <Card title="Capture circumstances" sub="Recorded on the device, before transit">
            {Object.keys(doc.captureMeta).length === 0 ? <div className="small muted">No device attestation recorded.</div> : (
              <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
                {Object.entries(doc.captureMeta).map(([key, value]) => (
                  <div key={key} style={{ display: 'contents' }}>
                    <dt>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
                    <dd className="small">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card title="This session">
            <div className="watermark">{detail.watermark}</div>
            <div className="tiny muted" style={{ marginTop: 8 }}>
              Every view and download carries this watermark. If a photographed screen appears on social
              media, the leak is attributable to one individual.
            </div>
            {detail.obligations.length > 0 && (
              <div className="row" style={{ gap: 5, marginTop: 10 }}>
                {detail.obligations.map((obligation) => <Chip key={obligation} tone="a">{obligation}</Chip>)}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Content({ detail }: { detail: Detail }) {
  const derived = detail.derivedText;
  return (
    <div className="stack">
      {derived && (
        <Banner tone={derived.needsVerification ? 'warn' : 'info'}
                title={`Machine-extracted text - ${derived.engine}, ${Math.round(derived.confidence * 100)}% confidence`}>
          This is derived metadata held in a separate namespace. It never touches the sealed original and
          it is not evidence - it exists so the document can be found.
          {derived.needsVerification && ' Confidence is below threshold: this text is queued for human verification.'}
        </Banner>
      )}
      {derived?.text
        ? <pre className="doc">{derived.text}</pre>
        : <Empty>No extracted text. Binary artefacts are stored sealed and searched by metadata.</Empty>}
      <div className="row">
        <button onClick={() => {
          const url = `/api/documents/${detail.document.id}/content?purpose=INVESTIGATION`;
          fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
            .then((r) => r.blob())
            .then((blob) => {
              const href = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = href; link.download = detail.document.title;
              link.click(); URL.revokeObjectURL(href);
            });
        }}>Download original</button>
        <span className="tiny muted">Downloads are logged, watermarked and counted by the anomaly detector.</span>
      </div>
    </div>
  );
}

function Integrity({ detail, verification, onVerify, onChanged }: {
  detail: Detail; verification: Verification | null; onVerify: () => void; onChanged: () => void;
}) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);

  const runDemo = async (action: 'tamper' | 'restore') => {
    setBusy(true);
    try {
      const result = await api.post<{ message?: string }>(`/demo/${action}/${detail.document.id}`);
      toast(action === 'tamper' ? 'danger' : 'ok',
            action === 'tamper' ? 'One bit flipped in storage' : 'Original restored',
            result.message ?? 'Now re-verify.');
      onVerify();
      onChanged();
    } catch (error) {
      toast('danger', 'Demo action failed', String(error));
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      {verification ? (
        <>
          <Banner tone={verification.status === 'verified' ? 'ok' : 'danger'}
                  alarm={verification.status === 'compromised'}
                  title={verification.status === 'verified'
                    ? 'VERIFIED - the document has not been altered'
                    : verification.status === 'missing' ? 'OBJECT MISSING' : 'ALTERED - fingerprint mismatch'}>
            {verification.detail}
          </Banner>
          {verification.actualHash && verification.actualHash !== verification.expectedHash
            ? <HashDiff expected={verification.expectedHash} actual={verification.actualHash} />
            : (
              <dl className="kv">
                <dt>Anchored fingerprint</dt><dd><Hash value={verification.expectedHash} /></dd>
                <dt>Recomputed now</dt><dd><Hash value={verification.actualHash} /></dd>
                <dt>Anchored at</dt><dd>{when(verification.anchoredAt)}</dd>
                <dt>Ledger transaction</dt><dd className="mono small">{verification.txRef ?? '-'}</dd>
                <dt>Checked</dt><dd>{when(verification.checkedAt)}</dd>
              </dl>
            )}
        </>
      ) : (
        <Empty>Run a verification to recompute the fingerprint from what is in storage right now.</Empty>
      )}

      <div className="divider" />
      <div className="card" style={{ boxShadow: 'none', borderColor: 'var(--warn)' }}>
        <div className="body">
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="demo-badge">Demonstration</span>
            <strong>Tamper with this document</strong>
          </div>
          <p className="small muted">
            Flips exactly one bit in the stored object - the digital equivalent of changing a single pixel
            in a photograph. The anchored fingerprint on the ledger does not change and cannot be changed,
            so the alteration becomes provable. The original is backed up first, so this is safe to rehearse.
          </p>
          <div className="row">
            <button className="danger" disabled={busy} onClick={() => runDemo('tamper')}>Flip one bit</button>
            <button disabled={busy} onClick={() => runDemo('restore')}>Restore original</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Custody({ detail }: { detail: Detail }) {
  if (detail.custody.length === 0) return <Empty>No custody events.</Empty>;
  return (
    <div className="timeline">
      {detail.custody.map((event) => (
        <div className="ev" key={event.id}>
          <div className="when">{when(event.created_at)}</div>
          <div className="what">
            <strong>{event.action.toUpperCase()}</strong>
            {' - '}{event.reason}
          </div>
          <div className="tiny muted">
            {event.from_name ?? 'origin'} → {event.to_name ?? '-'}
            {' · item hash '}{shortHash(event.item_hash, 10, 6)}
          </div>
          <div className="row" style={{ gap: 5, marginTop: 4 }}>
            {event.anchor_id && <Chip tone="a">anchored</Chip>}
            {event.received_sig
              ? <Chip tone="ok">both parties signed</Chip>
              : event.action !== 'seal' && <Chip tone="warn">awaiting receiving officer</Chip>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Versions({ detail }: { detail: Detail }) {
  return (
    <div className="stack">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Version</th><th>Fingerprint</th><th>Sealed</th><th /></tr></thead>
          <tbody>
            {detail.versions.map((version) => (
              <tr key={version.id}>
                <td>v{version.version}{version.id === detail.document.id && <Chip tone="a"> current</Chip>}</td>
                <td className="hash">{shortHash(version.hash.value, 14, 8)}</td>
                <td className="small">{when(version.createdAt)}</td>
                <td>{version.id !== detail.document.id && <Link className="small" to={`/documents/${version.id}`}>open</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tiny muted">
        Each version is a separate immutable object with its own fingerprint and its own ledger anchor,
        chained to the one before it. The <code>chargesheet_FINAL_use_this.docx</code> problem cannot occur here.
      </div>
      {detail.renditions.length > 0 && (
        <>
          <div className="divider" />
          <h4 className="muted">RENDITIONS</h4>
          {detail.renditions.map((rendition) => (
            <div key={rendition.id} className="row" style={{ justifyContent: 'space-between' }}>
              <Link to={`/documents/${rendition.id}`}>{rendition.title}</Link>
              <Chip tone="a">{rendition.renditionType}</Chip>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Certificate({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<{ certificateId: string; status: string;
    signatures: { role: string; name: string; designation: string; valid: boolean; keyFingerprint: string; signedAt: string }[] } | null>(null);

  const latest = detail.certificates[0];

  const loadCert = useCallback((id: string) => {
    api.get<typeof current>(`/documents/certificates/${id}`).then(setCurrent).catch(() => undefined);
  }, []);
  useEffect(() => { if (latest) loadCert(latest.id); }, [latest, loadCert]);

  const generate = async () => {
    setBusy(true);
    try {
      const result = await api.post<{ certificateId: string }>(`/documents/${detail.document.id}/certificate`,
        { purpose: 'Production before court' });
      toast('ok', 'Certificate generated', 'Pre-filled from data captured at seal time, not reconstructed from memory.');
      loadCert(result.certificateId);
      onChanged();
    } catch (error) {
      const denial = denialMessage(error);
      toast('danger', denial?.title ?? 'Failed', denial?.body ?? String(error));
    } finally { setBusy(false); }
  };

  const sign = async (role: 'device_custodian' | 'expert') => {
    if (!current) return;
    setBusy(true);
    try {
      await api.post(`/documents/certificates/${current.certificateId}/sign`, { role });
      toast('ok', `Signed as ${role.replace(/_/g, ' ')}`);
      loadCert(current.certificateId);
    } catch (error) {
      toast('danger', 'Could not sign', String(error instanceof Error ? error.message : error));
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <Banner tone="info" title="The law now asks for a hash">
        The 2023 evidence statute's prescribed certificate for electronic records requires the hash value
        of the record and the algorithm used, signed by the person in charge of the device and by an
        expert. PRAMANA fills it in at the moment of production from data captured at seal time - not
        reconstructed three years later by an officer who has since retired.
        <div className="tiny" style={{ marginTop: 6, opacity: .85 }}>
          Verify the exact prescribed format and section against indiacode.nic.in before relying on it.
        </div>
      </Banner>

      {!current ? (
        <button className="primary" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate evidence certificate'}
        </button>
      ) : (
        <>
          <dl className="kv">
            <dt>Certificate</dt><dd className="mono small">{current.certificateId}</dd>
            <dt>Status</dt><dd>{current.status === 'signed'
              ? <Chip tone="ok">both statutory signatures present</Chip>
              : <Chip tone="warn">awaiting signatures</Chip>}</dd>
          </dl>
          <div className="divider" />
          <h4 className="muted">SIGNATURES</h4>
          {(['device_custodian', 'expert'] as const).map((role) => {
            const block = current.signatures.find((s) => s.role === role);
            return (
              <div key={role} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <div className="small" style={{ fontWeight: 600 }}>
                    {role === 'device_custodian' ? 'Person in charge of the device' : 'Expert'}
                  </div>
                  {block
                    ? <div className="tiny muted">{block.name}, {block.designation} · key {block.keyFingerprint} · {when(block.signedAt)}</div>
                    : <div className="tiny muted">Not yet signed</div>}
                </div>
                {block
                  ? <Chip tone={block.valid ? 'ok' : 'danger'}>{block.valid ? 'signature valid' : 'INVALID'}</Chip>
                  : <button className="sm" disabled={busy} onClick={() => sign(role)}>Sign</button>}
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={() => {
              fetch(`/api/documents/certificates/${current.certificateId}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } })
                .then((r) => r.blob())
                .then((blob) => window.open(URL.createObjectURL(blob), '_blank'));
            }}>Open certificate PDF</button>
            <button className="ghost" onClick={generate} disabled={busy}>Generate a fresh one</button>
          </div>
          <div className="tiny muted">
            The same person cannot provide both statutory signatures, and each signature is bound to the
            certificate's content hash - signing version 7 does not silently approve version 8.
          </div>
        </>
      )}
    </div>
  );
}

type Pii = { type: string; value: string; start: number; end: number; confidence: number };

function Redaction({ detail, onChanged }: { detail: Detail; onChanged: () => void }) {
  const { toast } = useApp();
  const [proposals, setProposals] = useState<Pii[] | null>(null);
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ proposals: Pii[] }>(`/documents/${detail.document.id}/redaction/proposals`)
      .then((r) => { setProposals(r.proposals); setApproved(new Set(r.proposals.map((_, i) => i))); })
      .catch(() => setProposals([]));
  }, [detail.document.id]);

  if (!proposals) return <Loading what="Scanning for personal data" />;

  return (
    <div className="stack">
      <Banner tone="info" title="Machine proposes, a person decides">
        Nothing is redacted until a human confirms each span. When you apply, the redacted copy is sealed
        as a <strong>separate object with its own fingerprint and its own access rules</strong> - the
        content is removed, not covered with a black rectangle over recoverable text, and the original
        stays sealed and untouched.
      </Banner>

      {proposals.length === 0 ? <Empty>No personal data detected in the extracted text.</Empty> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ width: 40 }} /><th>Type</th><th>Detected value</th><th>Confidence</th></tr></thead>
              <tbody>
                {proposals.map((proposal, index) => (
                  <tr key={index}>
                    <td>
                      <input type="checkbox" style={{ width: 'auto' }} checked={approved.has(index)}
                             onChange={() => setApproved((current) => {
                               const next = new Set(current);
                               if (next.has(index)) next.delete(index); else next.add(index);
                               return next;
                             })} />
                    </td>
                    <td><Chip tone="warn">{proposal.type}</Chip></td>
                    <td className="mono small">{proposal.value}</td>
                    <td className="num small">{Math.round(proposal.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="primary" disabled={busy || approved.size === 0} onClick={async () => {
            setBusy(true);
            try {
              const result = await api.post<{ documentId: string; message: string }>(
                `/documents/${detail.document.id}/redaction/apply`,
                { approved: proposals.filter((_, i) => approved.has(i)), purpose: 'DISCLOSURE' },
              );
              toast('ok', 'Redacted rendition sealed', result.message);
              onChanged();
            } catch (error) {
              const denial = denialMessage(error);
              toast('danger', denial?.title ?? 'Failed', denial?.body ?? String(error));
            } finally { setBusy(false); }
          }}>
            Apply {approved.size} approved redaction{approved.size === 1 ? '' : 's'}
          </button>
        </>
      )}
    </div>
  );
}
