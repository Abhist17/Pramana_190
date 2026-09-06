import { Link } from 'react-router-dom';
import { useGov, type StringKey } from '../lib/gov.tsx';

/**
 * The standard furniture of a Government of India website: the utility strip,
 * the bilingual ministry masthead, the tricolour rule, breadcrumbs and the
 * footer. GIGW 3.0 specifies most of this, and it is what makes a citizen-facing
 * page read as official at a glance rather than as a startup dashboard.
 *
 * ON THE EMBLEM: the State Emblem of India is protected by the State Emblem of
 * India (Prohibition of Improper Use) Act, 2005, and may not be used on a
 * non-government prototype. We therefore render a PRAMANA departmental seal in
 * its place. If the platform is ever adopted, swap <Emblem/> for the official
 * asset - it is deliberately isolated in this one component.
 */

export function SkipLink() {
  const { t } = useGov();
  return <a className="skip-link" href="#main-content">{t('skipToMain')}</a>;
}

/** Departmental seal. Geometry only, so it stays crisp at 28px and needs no asset. */
export function Emblem({ size = 44 }: { size?: number }) {
  const spokes = Array.from({ length: 24 }, (_, index) => index * 15);
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 100 100" role="img"
         aria-label="PRAMANA departmental seal">
      <circle cx="50" cy="50" r="48" className="em-ring" />
      <circle cx="50" cy="50" r="43" className="em-ring-thin" />
      {spokes.map((angle) => (
        <line key={angle} x1="50" y1="50" x2="50" y2="12"
              className="em-spoke" transform={`rotate(${angle} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="30" className="em-field" />
      {/* Shield: custody of the record. */}
      <path d="M50 25 L70 33 V52 C70 65 61 73 50 78 C39 73 30 65 30 52 V33 Z" className="em-shield" />
      {/* Lock: sealed at capture. */}
      <path d="M43 50 V45 a7 7 0 0 1 14 0 V50" className="em-lock-bow" />
      <rect x="40" y="50" width="20" height="15" rx="2.5" className="em-lock-body" />
      <circle cx="50" cy="56" r="2.2" className="em-lock-pin" />
      <rect x="49" y="56" width="2" height="5" className="em-lock-pin" />
    </svg>
  );
}

/** Top utility strip: identity on the left, accessibility controls on the right. */
export function TopStrip() {
  const { t, locale, toggleLocale, fontScale, stepFont, highContrast, setHighContrast,
          theme, toggleTheme } = useGov();
  return (
    <div className="gov-strip">
      <div className="gov-strip-inner">
        <span className="gov-strip-id">
          <span lang="hi">भारत सरकार</span>
          <span className="sep" aria-hidden="true">|</span>
          <span lang="en">GOVERNMENT OF INDIA</span>
        </span>

        <div className="gov-strip-tools">
          <a href="#main-content" className="strip-link">{t('skipToMain')}</a>
          <Link to="/accessibility" className="strip-link">{t('screenReader')}</Link>

          <span className="strip-group" role="group" aria-label={t('textSize')}>
            <button type="button" className="strip-btn" aria-label={t('decreaseText')}
                    aria-pressed={fontScale === 'sm'} onClick={() => stepFont(-1)}>A<sup>-</sup></button>
            <button type="button" className="strip-btn" aria-label={t('normalText')}
                    aria-pressed={fontScale === 'md'} onClick={() => stepFont(0)}>A</button>
            <button type="button" className="strip-btn" aria-label={t('increaseText')}
                    aria-pressed={fontScale === 'lg'} onClick={() => stepFont(1)}>A<sup>+</sup></button>
          </span>

          <button type="button" className="strip-btn wide" aria-pressed={highContrast}
                  title={t('highContrast')} onClick={() => setHighContrast(!highContrast)}>
            <span className="contrast-glyph" aria-hidden="true" />
            {t('highContrast')}
          </button>

          <button type="button" className="strip-btn wide" aria-pressed={theme === 'dark'}
                  title={theme === 'dark' ? t('lightMode') : t('darkMode')} onClick={toggleTheme}>
            <span className="theme-glyph" aria-hidden="true">{theme === 'dark' ? '\u25D1' : '\u25D0'}</span>
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>

          <button type="button" className="strip-btn wide lang" onClick={toggleLocale}
                  aria-label={t('language')}>
            {locale === 'en' ? <span lang="hi">हिन्दी</span> : <span lang="en">English</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bilingual ministry lockup, then the tricolour rule. */
export function Masthead({ compact }: { compact?: boolean }) {
  const { t, locale } = useGov();
  return (
    <>
      <div className={`gov-masthead${compact ? ' compact' : ''}`}>
        <div className="gov-masthead-inner">
          <Link to="/" className="mast-lockup">
            <Emblem size={compact ? 44 : 56} />
            {/* A ministry lockup is bilingual on every GoI portal regardless of the
                language toggle, so these two lines are fixed. Only the subordinate
                line below them follows the selected language. */}
            <span className="mast-words">
              <span className="mast-ministry" lang="hi">गृह मंत्रालय</span>
              <span className="mast-ministry-en" lang="en">Ministry of Home Affairs</span>
              <span className="mast-bureau">
                {t('bureau')}
                <span className="mast-dot" aria-hidden="true">·</span>
                {t('division')}
              </span>
            </span>
          </Link>

          <div className="mast-brand">
            <span className="mast-brand-name">
              PRAMANA
              <span className="mast-brand-deva" lang="hi">प्रमाण</span>
            </span>
            <span className="mast-brand-sub">{t('platformTagline')}</span>
            <span className="mast-brand-ps" lang={locale}>
              Smart India Hackathon 2026 · PS 26190
            </span>
          </div>
        </div>
      </div>
      <div className="tricolour" role="presentation" />
    </>
  );
}

/** The honesty band. The project labels every simulation; this is the largest one. */
export function PrototypeBand() {
  const { t } = useGov();
  return (
    <div className="proto-band">
      <span className="proto-tag">{t('prototypeTitle')}</span>
      <span className="proto-body">{t('prototypeBody')}</span>
    </div>
  );
}

export type Crumb = { label: string; to?: string };

export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const { t } = useGov();
  const full: Crumb[] = [{ label: t('home'), to: '/' }, ...trail];
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {full.map((crumb, index) => {
          const last = index === full.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {crumb.to && !last
                ? <Link to={crumb.to}>{crumb.label}</Link>
                : <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>}
              {!last && <span className="crumb-sep" aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const FOOTER_LINKS: { key: StringKey; to: string }[] = [
  { key: 'accessibility', to: '/accessibility' },
  { key: 'terms',         to: '/accessibility#terms' },
  { key: 'privacy',       to: '/accessibility#privacy' },
  { key: 'copyright',     to: '/accessibility#copyright' },
  { key: 'hyperlinking',  to: '/accessibility#hyperlinking' },
  { key: 'rti',           to: '/accessibility#rti' },
  { key: 'help',          to: '/accessibility#help' },
  { key: 'feedback',      to: '/accessibility#feedback' },
  { key: 'sitemap',       to: '/accessibility#sitemap' },
];

export function GovFooter() {
  const { t } = useGov();
  return (
    <footer className="gov-footer">
      <div className="gov-footer-inner">
        <nav className="footer-links" aria-label="Footer">
          {FOOTER_LINKS.map(({ key, to }) => (
            <Link key={key} to={to}>{t(key)}</Link>
          ))}
        </nav>

        <div className="footer-meta">
          <p>{t('contentManaged')}</p>
          <p className="footer-honest">
            Prototype build. Not published by, or on behalf of, any government department.
            No real case data is present.
          </p>
          <p className="footer-stamp">
            <span>{t('gigwNote')}</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>{t('lastUpdated')}: {__BUILD_DATE__}</span>
          </p>
        </div>
      </div>
      <div className="tricolour bottom" role="presentation" />
    </footer>
  );
}

/** Public-facing wrapper: masthead, tricolour, content, footer. */
export function PublicShell({ trail, children }: { trail?: Crumb[]; children: React.ReactNode }) {
  return (
    <div className="gov-page">
      <SkipLink />
      <TopStrip />
      <Masthead />
      <PrototypeBand />
      {trail && (
        <div className="crumb-bar">
          <div className="crumb-bar-inner"><Breadcrumbs trail={trail} /></div>
        </div>
      )}
      <main id="main-content" className="public" tabIndex={-1}>
        {children}
      </main>
      <GovFooter />
    </div>
  );
}
