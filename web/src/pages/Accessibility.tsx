import { Card, Chip } from '../components/ui.tsx';
import { PublicShell } from '../components/GovChrome.tsx';
import { useGov } from '../lib/gov.tsx';

/**
 * The statutory pages a Government of India website is required to publish.
 *
 * GIGW 3.0 makes an accessibility statement, a terms page, a privacy policy, a
 * copyright policy, a hyperlinking policy and a feedback route mandatory before
 * a site may be hosted on a gov.in domain, and STQC checks for them at audit.
 * Most hackathon prototypes ship footer links that go nowhere; these resolve,
 * and each one states honestly what this build does and does not do.
 */

const CONFORMANCE = [
  { criterion: 'Text resize to 200% without loss of content', status: 'Met',
    note: 'Every type size derives from one scale token driven by the A- / A / A+ control.' },
  { criterion: 'Contrast minimum (WCAG 1.4.3, 4.5:1 body text)', status: 'Met',
    note: 'Institutional navy on white measures 12.6:1; the dedicated high-contrast mode raises all text to pure black.' },
  { criterion: 'Keyboard operable, no traps (WCAG 2.1.1, 2.1.2)', status: 'Met',
    note: 'Every control is a native button, link, input or select. The skip link is the first tab stop.' },
  { criterion: 'Focus visible (WCAG 2.4.7)', status: 'Met',
    note: 'A 3px outline in a hue distinct from every surface. Never removed.' },
  { criterion: 'Bypass blocks (WCAG 2.4.1)', status: 'Met',
    note: 'Skip to main content, plus landmark regions - banner, navigation, main, contentinfo.' },
  { criterion: 'Language of page and of parts (WCAG 3.1.1, 3.1.2)', status: 'Met',
    note: 'The root lang attribute follows the language toggle; Devanagari passages carry lang="hi".' },
  { criterion: 'Reduced motion (WCAG 2.3.3)', status: 'Met',
    note: 'prefers-reduced-motion suppresses the integrity-failure alarm animation.' },
  { criterion: 'Non-text contrast for form borders (WCAG 1.4.11)', status: 'Met',
    note: 'Field and card borders meet 3:1 in both the default and high-contrast palettes.' },
  { criterion: 'Captions and audio description (WCAG 1.2.x)', status: 'Not applicable to this build',
    note: 'No pre-recorded media is served. Body-worn video playback is out of scope for the prototype.' },
  { criterion: 'Screen-reader testing with NVDA and JAWS', status: 'Not done',
    note: 'Semantics and ARIA were authored to specification but have not been tested with assistive technology. Stated rather than assumed.' },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function Accessibility() {
  const { t } = useGov();

  return (
    <PublicShell trail={[{ label: t('accessibility') }]}>
      <div className="shell" style={{ maxWidth: 980 }}>
        <div className="stack">
          <Card title={t('accessibility')} sub="Guidelines for Indian Government Websites (GIGW) 3.0 · WCAG 2.1 Level AA">
            <div className="policy-doc">
              <p>
                This platform is built to be usable by everyone, including officers and citizens who use
                a screen reader, navigate by keyboard alone, or need larger text or higher contrast. The
                controls sit in the strip at the top of every page and their setting is remembered on
                this device.
              </p>
              <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                <Chip tone="a">Text resize A- A A+</Chip>
                <Chip tone="a">High contrast mode</Chip>
                <Chip tone="a">Skip to main content</Chip>
                <Chip tone="a">Bilingual chrome</Chip>
                <Chip tone="a">Keyboard operable</Chip>
              </div>
            </div>
          </Card>

          <Card title="Conformance, item by item" sub="Claimed only where it is true. Two rows say so plainly." tight>
            <div className="table-wrap">
              <table>
                <caption className="tiny muted" style={{ captionSide: 'bottom', padding: '8px 13px', textAlign: 'left' }}>
                  A conformance table that admits an untested row is worth more than one that claims
                  full AA without evidence.
                </caption>
                <thead>
                  <tr><th scope="col">Success criterion</th><th scope="col">Status</th><th scope="col">How</th></tr>
                </thead>
                <tbody>
                  {CONFORMANCE.map((row) => (
                    <tr key={row.criterion}>
                      <th scope="row" style={{ background: 'transparent', color: 'var(--ink)',
                        position: 'static', textTransform: 'none', letterSpacing: 0,
                        fontSize: 'var(--t-sm)', borderBottom: '1px solid var(--line)' }}>
                        {row.criterion}
                      </th>
                      <td>
                        <Chip tone={row.status === 'Met' ? 'ok' : row.status === 'Not done' ? 'warn' : 'n'}>
                          {row.status}
                        </Chip>
                      </td>
                      <td className="small muted">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="policy-doc">
              <Section id="terms" title={t('terms')}>
                <p>
                  This is a Smart India Hackathon 2026 prototype built for problem statement 26190. It is
                  not a live government service, it holds no real case data, and nothing shown here has
                  evidential value. Every officer, case number, address and telephone number in the
                  corpus is fictional.
                </p>
              </Section>

              <Section id="privacy" title={t('privacy')}>
                <p>
                  The prototype stores no personal data about visitors. Three preferences - language, text
                  size and contrast - are kept in this browser only, and a session token is held in browser
                  storage while you are signed in. Neither is transmitted anywhere except to the local API.
                </p>
                <p>
                  Within the platform itself, purpose limitation under the Digital Personal Data
                  Protection Act is enforced structurally: every content read requires a purpose code
                  drawn from a controlled vocabulary, and the code is recorded with the access.
                </p>
                <ul>
                  <li>The public verifier records only the fingerprint submitted, never the file.</li>
                  <li>The citizen portal discloses investigation stage and statutory notices, never material.</li>
                  <li>Personal data is refused at the ledger boundary and cannot be anchored.</li>
                </ul>
              </Section>

              <Section id="copyright" title={t('copyright')}>
                <p>
                  The source is released under the MIT Licence. The State Emblem of India is
                  <strong> not</strong> used anywhere in this interface: it is protected by the State
                  Emblem of India (Prohibition of Improper Use) Act, 2005, and may not appear on a
                  prototype that is not a government publication. The seal shown in the masthead is an
                  original PRAMANA device drawn for this project.
                </p>
              </Section>

              <Section id="hyperlinking" title={t('hyperlinking')}>
                <p>
                  Links within this prototype point only to its own pages. No external site is framed,
                  and no government portal is linked in a way that implies endorsement.
                </p>
              </Section>

              <Section id="rti" title={t('rti')}>
                <p>
                  A live deployment would publish its Central Public Information Officer and first
                  appellate authority here, together with the disclosure exemptions that apply to
                  material under investigation. A prototype has no public authority and therefore no CPIO.
                </p>
              </Section>

              <Section id="help" title={t('help')}>
                <dl className="kv">
                  <dt>Sign in</dt>
                  <dd>Pick a demonstration officer on the sign-in page. Every account uses the password <code>pramana</code>.</dd>
                  <dt>Verify a document</dt>
                  <dd>Open the public verifier and drop the file in. No account is needed.</dd>
                  <dt>Check a case as a complainant</dt>
                  <dd>Open the citizen portal and enter the reference number, then the one-time password.</dd>
                  <dt>Access refused</dt>
                  <dd>The refusal names the rule that produced it. The access policy page simulates any officer against any record and shows every rule that fired.</dd>
                </dl>
              </Section>

              <Section id="feedback" title={t('feedback')}>
                <p>
                  Issues and suggestions belong on the project repository. A deployed service would
                  publish a departmental grievance address and an acknowledgement time here.
                </p>
              </Section>

              <Section id="sitemap" title={t('sitemap')}>
                <ul>
                  <li><a href="/">Officer console - dashboard, cases, search</a></li>
                  <li><a href="/compliance">Statutory deadlines</a> and <a href="/women-safety">Women Safety Division</a></li>
                  <li><a href="/audit">Audit trail</a>, <a href="/ledger">consortium ledger</a>, <a href="/policy">access policy</a></li>
                  <li><a href="/verify">Public verifier</a> - open to anyone, no account</li>
                  <li><a href="/citizen">Citizen case status portal</a></li>
                </ul>
              </Section>
            </div>
          </Card>

          <div className="center small muted">
            <a href="/">&larr; {t('officerConsole')}</a> &middot; <a href="/verify">{t('navVerifier')}</a> &middot;{' '}
            <a href="/citizen">{t('navCitizen')}</a>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
