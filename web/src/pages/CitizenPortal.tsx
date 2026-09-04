import { useState } from 'react';
import { Banner, Card, Chip } from '../components/ui.tsx';
import { when } from '../lib/format.ts';

type Status = {
  caseNumber: string; status: string; registeredAt: string; station: string;
  progress: { sent_at: string; template: string; body: string; channel: string }[];
  statutoryUpdate: { dueAt: string; status: string; basis: string } | null;
  note: string;
};

/**
 * Citizen case-status portal.
 *
 * The complainant checks progress with a reference number and an OTP, without
 * visiting the station. It shows the stage of the investigation and the statutory
 * communications sent - never investigative content.
 */
export default function CitizenPortal() {
  const [reference, setReference] = useState('FIR-2026-0142');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<{ sentTo: string; demoOtp: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    setBusy(true); setError(null); setStatus(null);
    try {
      const response = await fetch('/api/public/citizen/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceNo: reference.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Not found');
      setSent(payload);
      setOtp(payload.demoOtp ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally { setBusy(false); }
  };

  const check = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/public/citizen/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceNo: reference.trim(), otp: otp.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Could not verify');
      setStatus(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="public">
      <div className="shell" style={{ maxWidth: 620 }}>
        <div className="mast">
          <div className="name">PRAMANA</div>
          <div className="sub">Case status for complainants · शिकायतकर्ता हेतु स्थिति</div>
        </div>

        <div className="stack">
          <Card title="Check your case">
            <div className="field">
              <label>Case reference number</label>
              <input value={reference} onChange={(event) => setReference(event.target.value)}
                     placeholder="FIR-2026-0142" className="mono" />
            </div>
            <button className="primary" onClick={requestOtp} disabled={busy || !reference.trim()}>
              {busy ? 'Sending…' : 'Send OTP to my registered mobile'}
            </button>

            {sent && (
              <>
                <div className="divider" />
                <Banner tone="info" title={`OTP sent to ${sent.sentTo}`}>
                  In a live deployment this arrives by SMS and is never shown on screen. For the
                  demonstration it is <strong className="mono">{sent.demoOtp}</strong>.
                </Banner>
                <div className="field" style={{ marginTop: 13 }}>
                  <label>One-time password</label>
                  <input value={otp} onChange={(event) => setOtp(event.target.value)} className="mono" maxLength={6} />
                </div>
                <button className="primary" onClick={check} disabled={busy || otp.length !== 6}>Check status</button>
              </>
            )}

            {error && <div style={{ marginTop: 13 }}><Banner tone="danger" title="Could not retrieve">{error}</Banner></div>}
          </Card>

          {status && (
            <Card title={status.caseNumber} sub={status.station}>
              <dl className="kv" style={{ gridTemplateColumns: '150px 1fr' }}>
                <dt>Current stage</dt><dd><Chip tone="a">{status.status.replace(/_/g, ' ')}</Chip></dd>
                <dt>Registered on</dt><dd>{when(status.registeredAt)}</dd>
              </dl>

              {status.statutoryUpdate && (
                <>
                  <div className="divider" />
                  <Banner tone={status.statutoryUpdate.status === 'breached' ? 'warn' : 'info'}
                          title="Statutory progress update">
                    You are entitled to be informed of the progress of the investigation within ninety
                    days, including by electronic means. Due {when(status.statutoryUpdate.dueAt)}.
                    <div className="tiny mono" style={{ marginTop: 6, opacity: .85 }}>{status.statutoryUpdate.basis}</div>
                  </Banner>
                </>
              )}

              <div className="divider" />
              <h4 className="muted" style={{ marginBottom: 9 }}>COMMUNICATIONS SENT TO YOU</h4>
              {status.progress.length === 0
                ? <div className="small muted">No communications have been issued yet.</div>
                : (
                  <div className="timeline">
                    {status.progress.map((entry, index) => (
                      <div className="ev" key={index}>
                        <div className="when">{when(entry.sent_at)} · {entry.channel}</div>
                        <div className="what small">{entry.body}</div>
                      </div>
                    ))}
                  </div>
                )}

              <div className="divider" />
              <div className="tiny muted">{status.note}</div>
            </Card>
          )}

          <div className="center small muted">
            <a href="/verify">← Public verifier</a>
          </div>
        </div>
      </div>
    </div>
  );
}
