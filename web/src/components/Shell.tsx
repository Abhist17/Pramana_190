import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app.tsx';
import { api } from '../lib/api.ts';
import { initials } from '../lib/format.ts';

const NAV = [
  { group: 'Investigation', items: [
    { to: '/', label: 'Dashboard', glyph: '◧', end: true },
    { to: '/cases', label: 'Cases', glyph: '▤' },
    { to: '/search', label: 'Search', glyph: '⌕' },
  ]},
  { group: 'Compliance', items: [
    { to: '/compliance', label: 'Statutory deadlines', glyph: '⏱' },
    { to: '/women-safety', label: 'Women Safety', glyph: '⚖' },
  ]},
  { group: 'Assurance', items: [
    { to: '/audit', label: 'Audit trail', glyph: '☰', badge: 'alerts' as const },
    { to: '/ledger', label: 'Consortium ledger', glyph: '⛓' },
    { to: '/policy', label: 'Access policy', glyph: '⊘' },
  ]},
];

export default function Shell({ children }: { children: ReactNode }) {
  const { user, signOut, purpose, setPurpose, purposeCodes } = useApp();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState(0);

  useEffect(() => {
    const load = () => api.get<{ openAlerts: number }>('/security/dashboard')
      .then((d) => setAlerts(d.openAlerts))
      .catch(() => undefined);
    load();
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="name">PRAMANA</div>
          <div className="sub">Secure Evidence &amp; Document Platform<br />NCRB · Women Safety Division</div>
        </div>
        <nav className="nav">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="nav-group">{section.group}</div>
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={'end' in item ? item.end : false}>
                  <span className="glyph">{item.glyph}</span>
                  {item.label}
                  {'badge' in item && alerts > 0 && <span className="count">{alerts}</span>}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-group">Public</div>
          <a href="/verify" target="_blank" rel="noreferrer"><span className="glyph">✓</span>Public verifier</a>
          <a href="/citizen" target="_blank" rel="noreferrer"><span className="glyph">☎</span>Citizen portal</a>
        </nav>
        <div className="whoami">
          <div className="row" style={{ gap: 9, flexWrap: 'nowrap' }}>
            <div className="persona-av av" style={{
              width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-bg)',
              color: 'var(--accent-ink)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11, flex: 'none',
            }}>{initials(user!.fullName)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="n">{user!.fullName}</div>
              <div className="d">{user!.designation}</div>
            </div>
          </div>
          <button className="ghost sm" style={{ marginTop: 9, width: '100%', justifyContent: 'center' }}
                  onClick={() => { signOut(); navigate('/'); }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="small muted">
            {user!.station ?? user!.unit} · {user!.district}
          </div>
          <div className="spacer" />
          {/* Purpose-bound access: you do not simply open a document, you open it for a reason. */}
          <label htmlFor="purpose" style={{ margin: 0 }}>Access purpose</label>
          <select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ width: 250 }}>
            {Object.entries(purposeCodes).map(([code, label]) => (
              <option key={code} value={code}>{code} - {label}</option>
            ))}
          </select>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
