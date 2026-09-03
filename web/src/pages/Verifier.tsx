import { useCallback, useRef, useState } from 'react';
import { Banner, Card, Chip, Hash } from '../components/ui.tsx';
import { when } from '../lib/format.ts';

type Verdict = {
  verdict: 'VERIFIED' | 'NOT_FOUND';
  algorithm: string; hash: string; filename: string | null; sizeBytes: number | null;
  anchoredAt?: string; chainId?: string; contract?: string; transactionRef?: string;
  blockNumber?: number | null; message: string; disclosure?: string;
};

/**
 * The public verifier — no login, no account, nothing to trust.
 *
 * Hand the laptop to a judge and let them drop the file in themselves. It reveals
 * whether a fingerprint was anchored and when, and nothing whatsoever about
 * content, case or parties. Integrity stops being a claim and becomes something
 * the other side can check.
 */
export default function Verifier() {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [manual, setManual] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const verifyFile = useCallback(async (file: File) => {
    setBusy(true); setVerdict(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/public/verify', { method: 'POST', body: form });
      setVerdict(await response.json());
    } catch {
      setVerdict(null);
    } finally { setBusy(false); }
  }, []);

  const verifyHash = useCallback(async (hash: string) => {
    setBusy(true); setVerdict(null);
    try {
      const response = await fetch(`/api/public/verify/${encodeURIComponent(hash.trim())}`);
      setVerdict(await response.json());
    } finally { setBusy(false); }
  }, []);

  return (
    <div className="public">
      <div className="shell">
        <div className="mast">
          <div className="name">PRAMANA</div>
          <div className="sub">Public evidence verifier</div>
        </div>

        <div className="stack">
          <Banner tone="info" title="Check any document for yourself">
            Drop a file below. This page recomputes its SHA-256 fingerprint and asks the consortium
            ledger whether that exact fingerprint was ever anchored, and when. It tells you nothing about
            what the document says, which case it belongs to, or who is involved — and it needs no
            account, because you are not being asked to trust us.
          </Banner>

          <div
            className={`drop${over ? ' over' : ''}`}
            onClick={() => input.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault(); setOver(false);
              const file = event.dataTransfer.files[0];
              if (file) verifyFile(file);
            }}
          >
            <div className="big">{busy ? 'Computing fingerprint…' : 'Drop a file here, or click to choose one'}</div>
            <div className="muted small">The file never leaves this network. Only its fingerprint is compared.</div>
            <input ref={input} type="file" hidden onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) verifyFile(file);
            }} />
          </div>

          {verdict && (
            <Card>
              {verdict.verdict === 'VERIFIED' ? (
                <Banner tone="ok" title="VERIFIED — this exact file was sealed and anchored">
                  {verdict.message}
                </Banner>
              ) : (
                <Banner tone="danger" alarm title="NOT FOUND — no anchored record has this fingerprint">
                  {verdict.message}
                </Banner>
              )}

              <div className="divider" />
              <dl className="kv">
                {verdict.filename && <><dt>File</dt><dd>{verdict.filename}
                  {verdict.sizeBytes !== null && <span className="muted"> · {verdict.sizeBytes} bytes</span>}</dd></>}
                <dt>Algorithm</dt><dd className="mono">{verdict.algorithm}</dd>
                <dt>Fingerprint</dt><dd><Hash value={verdict.hash} /></dd>
                {verdict.verdict === 'VERIFIED' && (
                  <>
                    <dt>Anchored at</dt><dd>{when(verdict.anchoredAt)}</dd>
                    <dt>Consortium chain</dt><dd className="mono small">{verdict.chainId}</dd>
                    <dt>Contract</dt><dd className="mono small">{verdict.contract}</dd>
                    <dt>Transaction</dt><dd className="mono small">{verdict.transactionRef}</dd>
                    <dt>Block</dt><dd className="num">{verdict.blockNumber ?? 'pending'}</dd>
                  </>
                )}
              </dl>

              {verdict.disclosure && (
                <>
                  <div className="divider" />
                  <div className="tiny muted">{verdict.disclosure}</div>
                </>
              )}
            </Card>
          )}

          <Card title="Already have the fingerprint?" sub="Paste a SHA-256 digest instead of the file">
            <form className="row" style={{ flexWrap: 'nowrap' }}
                  onSubmit={(event) => { event.preventDefault(); if (manual.trim()) verifyHash(manual); }}>
              <input value={manual} onChange={(event) => setManual(event.target.value)}
                     placeholder="e.g. 81ffe0ee6415cd670150bfc3fb6fe32d…" className="mono" />
              <button className="primary" type="submit" disabled={busy || !manual.trim()}>Check</button>
            </form>
          </Card>

          <Card title="Why a single changed bit is enough">
            <p className="small">
              A cryptographic fingerprint is a short string derived from every byte of a file. Change one
              pixel, one comma, one bit, and the fingerprint changes completely and unpredictably. You
              cannot work backwards from it to the file, and you cannot construct a different file with
              the same fingerprint.
            </p>
            <p className="small">
              So the fingerprint was recorded when the document was created, on a ledger jointly operated
              by institutions that do not report to one another. Anyone can recompute the fingerprint of
              the file in front of them and compare. Match means untouched. Mismatch means altered. It
              takes milliseconds, and it does not require believing anything we say.
            </p>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <Chip tone="n">no account</Chip>
              <Chip tone="n">no content disclosed</Chip>
              <Chip tone="n">independently checkable</Chip>
            </div>
          </Card>

          <div className="center small muted">
            <a href="/">← Officer console</a> · <a href="/citizen">Citizen case status</a>
          </div>
        </div>
      </div>
    </div>
  );
}
