import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../lib/app.tsx';
import { api } from '../lib/api.ts';
import { initials } from '../lib/format.ts';
import { useGov, type StringKey } from '../lib/gov.tsx';
import {
  Breadcrumbs, Emblem, GovFooter, Masthead, PrototypeBand, SkipLink, TopStrip, type Crumb,
} from './GovChrome.tsx';

type NavItem = { to: string; key: StringKey; glyph: string; end?: boolean; badge?: boolean };

const NAV: { group: StringKey; items: NavItem[] }[] = [
  { group: 'navInvestigation', items: [
    { to: '/', key: 'navDashboard', glyph: '◧', end: true },
    { to: '/cases', key: 'navCases', glyph: '▤' },
    { to: '/search', key: 'navSearch', glyph: '⌕' },
  ]},
  { group: 'navCompliance', items: [
    { to: '/compliance', key: 'navDeadlines', glyph: '⏱' },
    { to: '/women-safety', key: 'navWomenSafety', glyph: '⚖' },
  ]},
  { group: 'navAssurance', items: [
    { to: '/audit', key: 'navAudit', glyph: '☰', badge: true },
    { to: '/ledger', key: 'navLedger', glyph: '⛓' },
    { to: '/policy', key: 'navPolicy', glyph: '⊘' },
  ]},
];

/** Route to breadcrumb trail. Record ids stay opaque - a crumb must never leak a case number. */
function useTrail(): Crumb[] {
  const { pathname } = useLocation();
  const { t } = useGov();
  return useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [{ label: t('navDashboard') }];

    const head = segments[0];
    const map: Record<string, StringKey> = {
      cases: 'navCases', search: 'navSearch', compliance: 'navDeadlines',
      'women-safety': 'navWomenSafety', audit: 'navAudit', ledger: 'navLedger',
      policy: 'navPolicy', accessibility: 'accessibility',
    };

    if (head === 'documents') {
      return [{ label: t('navCases'), to: '/cases' }, { label: 'Document' }];
    }
    const key = head ? map[head] : undefined;
    if (!key) return [{ label: t('navDashboard') }];
    if (head === 'cases' && segments.length > 1) {
      return [{ label: t('navCases'), to: '/cases' }, { label: 'Case file' }];
    }
    return [{ label: t(key) }];
  }, [pathname, t]);
}

export default function Shell({ children }: { children: ReactNode }) {
  const { user, signOut, purpose, setPurpose, purposeCodes } = useApp();
  const { t } = useGov();
  const navigate = useNavigate();
  const trail = useTrail();
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
    <div className="gov-page">
      <SkipLink />
      <TopStrip />
      <Masthead compact />
      <PrototypeBand />

      <div className="app">
        <div className="app-body">
          <aside className="sidebar">
            <div className="brand">
              <div className="name"><Emblem size={22} />PRAMANA</div>
              <div className="sub">
                {t('platformTagline')}<br />
                {t('bureau')} &middot; {t('division')}
              </div>
            </div>

            <nav className="nav" aria-label="Sections">
              {NAV.map((section) => (
                <div key={section.group}>
                  <div className="nav-group">{t(section.group)}</div>
                  {section.items.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end ?? false}>
                      <span className="glyph" aria-hidden="true">{item.glyph}</span>
                      {t(item.key)}
                      {item.badge && alerts > 0 && (
                        <span className="count" aria-label={`${alerts} open alerts`}>{alerts}</span>
                      )}
                    </NavLink>
                  ))}
                </div>
              ))}
              <div className="nav-group">{t('navPublic')}</div>
              <a href="/verify" target="_blank" rel="noreferrer">
                <span className="glyph" aria-hidden="true">&#10003;</span>{t('navVerifier')}
              </a>
              <a href="/citizen" target="_blank" rel="noreferrer">
                <span className="glyph" aria-hidden="true">&#9742;</span>{t('navCitizen')}
              </a>
            </nav>

            <div className="whoami">
              <div className="row" style={{ gap: 9, flexWrap: 'nowrap' }}>
                <div className="av" style={{
                  width: 30, height: 30, borderRadius: '50%', background: 'var(--navy-2)',
                  color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 750,
                  fontSize: 'var(--t-xs)', flex: 'none',
                }}>{initials(user!.fullName)}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="n">{user!.fullName}</div>
                  <div className="d">{user!.designation}</div>
                </div>
              </div>
              <button className="ghost sm" style={{ marginTop: 9, width: '100%', justifyContent: 'center' }}
                      onClick={() => { signOut(); navigate('/'); }}>
                {t('signOut')}
              </button>
            </div>
          </aside>

          <div className="main">
            <div className="topbar">
              <Breadcrumbs trail={trail} />
              <div className="spacer" />
              <span className="small muted">{user!.station ?? user!.unit} &middot; {user!.district}</span>
              {/* Purpose-bound access: you do not simply open a document, you open it for a reason. */}
              <label htmlFor="purpose" style={{ margin: 0 }}>{t('accessPurpose')}</label>
              <select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} style={{ width: 250 }}>
                {Object.entries(purposeCodes).map(([code, label]) => (
                  <option key={code} value={code}>{code} - {label}</option>
                ))}
              </select>
            </div>
            <main id="main-content" className="content" tabIndex={-1}>{children}</main>
          </div>
        </div>
      </div>

      <GovFooter />
    </div>
  );
}
