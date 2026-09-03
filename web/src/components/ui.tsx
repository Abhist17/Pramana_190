import { useEffect, useState, type ReactNode } from 'react';

export function Card({ title, sub, actions, children, tight }: {
  title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; tight?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header>
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          <div className="spacer" />
          {actions}
        </header>
      )}
      <div className={`body${tight ? ' tight' : ''}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, note, tone }: {
  label: string; value: ReactNode; note?: ReactNode; tone?: 'ok' | 'warn' | 'danger';
}) {
  return (
    <div className={`card stat${tone ? ` ${tone}` : ''}`}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {note && <div className="n">{note}</div>}
    </div>
  );
}

export function Chip({ tone = 'n', children }: { tone?: string; children: ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function Banner({ tone, title, children, alarm }: {
  tone: 'ok' | 'warn' | 'danger' | 'info' | 'seal'; title: ReactNode; children?: ReactNode; alarm?: boolean;
}) {
  const icon = { ok: '✓', warn: '!', danger: '✕', info: 'i', seal: '⛓' }[tone];
  return (
    <div className={`banner ${tone}${alarm ? ' alarm' : ''}`}>
      <div className="icon">{icon}</div>
      <div>
        <div className="t">{title}</div>
        {children && <div className="m">{children}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Meter({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className={`meter${tone ? ` ${tone}` : ''}`}>
      <i style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button key={tab.id} className={tab.id === value ? 'on' : ''} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, children, footer, onClose }: {
  title: ReactNode; children: ReactNode; footer?: ReactNode; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-host" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header>{title}</header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** Copy-to-clipboard hash with a short display form. */
export function Hash({ value, big }: { value?: string | null; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="muted">—</span>;
  return (
    <span
      className={`hash${big ? ' big' : ''}`}
      title={`${value}\n(click to copy)`}
      style={{ cursor: 'pointer' }}
      onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
    >
      {value}
      {copied && <span className="chip ok" style={{ marginLeft: 6 }}>copied</span>}
    </span>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <div className="empty">{what}…</div>;
}

/**
 * Highlights the exact characters that differ between two digests — the visual
 * that makes "the fingerprint changed completely" land in a demo.
 */
export function HashDiff({ expected, actual }: { expected: string; actual: string }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div>
        <div className="tiny muted">Anchored at seal time</div>
        <div className="hash big">{expected}</div>
      </div>
      <div>
        <div className="tiny muted">Recomputed from storage now</div>
        <div className="hash big">
          {[...actual].map((char, index) => (
            <span key={index} style={char !== expected[index] ? { background: '#fecaca', color: '#7f1d1d', fontWeight: 700 } : undefined}>
              {char}
            </span>
          ))}
        </div>
      </div>
      <div className="tiny muted">
        {[...actual].filter((c, i) => c !== expected[i]).length} of {expected.length} hex characters differ.
      </div>
    </div>
  );
}
