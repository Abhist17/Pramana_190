import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Government presentation layer: bilingual chrome and the accessibility controls
 * that GIGW 3.0 requires on the masthead of every Government of India website.
 *
 * These are not decoration. GIGW mandates a text-resize control, a high-contrast
 * mode, a skip-to-content link and a screen-reader statement, and STQC audits
 * against them before a site is allowed to go live on a gov.in domain. Building
 * them in from the start is cheaper than retrofitting, and it is the difference
 * between a prototype that could be deployed and one that could not.
 */

export type Locale = 'en' | 'hi';
export type FontScale = 'sm' | 'md' | 'lg';

type GovState = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  fontScale: FontScale;
  setFontScale: (next: FontScale) => void;
  stepFont: (direction: -1 | 0 | 1) => void;
  highContrast: boolean;
  setHighContrast: (next: boolean) => void;
  t: (key: StringKey) => string;
  /** Picks the right member of an `{ en, hi }` pair for the active locale. */
  pick: (pair: { en: string; hi: string }) => string;
};

const Ctx = createContext<GovState | null>(null);

export function useGov(): GovState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useGov must be used inside <GovProvider>');
  return value;
}

/** Convenience for components that only need the translator. */
export const useT = () => useGov().t;

const FONT_SCALES: FontScale[] = ['sm', 'md', 'lg'];

export function GovProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => (localStorage.getItem('pramana.locale') as Locale | null) ?? 'en',
  );
  const [fontScale, setFontScaleState] = useState<FontScale>(
    () => (localStorage.getItem('pramana.fontScale') as FontScale | null) ?? 'md',
  );
  const [highContrast, setHighContrastState] = useState(
    () => localStorage.getItem('pramana.contrast') === 'high',
  );

  // The root element carries the preferences so plain CSS can respond to them,
  // which keeps every page and every third-party-free component in step.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dataset.fontScale = fontScale;
    root.dataset.contrast = highContrast ? 'high' : 'normal';
  }, [locale, fontScale, highContrast]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem('pramana.locale', next);
  }, []);

  const setFontScale = useCallback((next: FontScale) => {
    setFontScaleState(next);
    localStorage.setItem('pramana.fontScale', next);
  }, []);

  const setHighContrast = useCallback((next: boolean) => {
    setHighContrastState(next);
    localStorage.setItem('pramana.contrast', next ? 'high' : 'normal');
  }, []);

  const stepFont = useCallback((direction: -1 | 0 | 1) => {
    if (direction === 0) return setFontScale('md');
    setFontScaleState((current) => {
      const index = FONT_SCALES.indexOf(current);
      const next = FONT_SCALES[Math.min(Math.max(index + direction, 0), FONT_SCALES.length - 1)]!;
      localStorage.setItem('pramana.fontScale', next);
      return next;
    });
  }, [setFontScale]);

  const toggleLocale = useCallback(
    () => setLocale(locale === 'en' ? 'hi' : 'en'),
    [locale, setLocale],
  );

  const t = useCallback((key: StringKey) => STRINGS[key][locale], [locale]);
  const pick = useCallback((pair: { en: string; hi: string }) => pair[locale], [locale]);

  const value = useMemo<GovState>(
    () => ({
      locale, setLocale, toggleLocale, fontScale, setFontScale, stepFont,
      highContrast, setHighContrast, t, pick,
    }),
    [locale, setLocale, toggleLocale, fontScale, setFontScale, stepFont, highContrast, setHighContrast, t, pick],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------------ strings --
 * Chrome only: masthead, navigation, footer and the accessibility controls.
 * Case content is never machine-translated - a statement recorded in Marathi is
 * produced in court in Marathi, and a translated evidential document would be a
 * new document requiring its own seal.
 */

const STRINGS = {
  govtOfIndia:      { en: 'Government of India',                 hi: 'भारत सरकार' },
  ministry:         { en: 'Ministry of Home Affairs',            hi: 'गृह मंत्रालय' },
  bureau:           { en: 'National Crime Records Bureau',       hi: 'राष्ट्रीय अपराध रिकॉर्ड ब्यूरो' },
  division:         { en: 'Women Safety Division',               hi: 'महिला सुरक्षा प्रभाग' },
  platformName:     { en: 'PRAMANA',                             hi: 'प्रमाण' },
  platformTagline:  { en: 'Secure Evidence and Document Platform', hi: 'सुरक्षित साक्ष्य एवं दस्तावेज़ प्लेटफ़ॉर्म' },

  skipToMain:       { en: 'Skip to main content',                hi: 'मुख्य सामग्री पर जाएँ' },
  screenReader:     { en: 'Screen reader access',                hi: 'स्क्रीन रीडर पहुँच' },
  textSize:         { en: 'Text size',                           hi: 'पाठ का आकार' },
  decreaseText:     { en: 'Decrease text size',                  hi: 'पाठ का आकार घटाएँ' },
  normalText:       { en: 'Normal text size',                    hi: 'सामान्य पाठ आकार' },
  increaseText:     { en: 'Increase text size',                  hi: 'पाठ का आकार बढ़ाएँ' },
  highContrast:     { en: 'High contrast',                       hi: 'उच्च कंट्रास्ट' },
  language:         { en: 'Language',                            hi: 'भाषा' },

  navInvestigation: { en: 'Investigation',                       hi: 'अन्वेषण' },
  navCompliance:    { en: 'Compliance',                          hi: 'अनुपालन' },
  navAssurance:     { en: 'Assurance',                           hi: 'आश्वासन' },
  navPublic:        { en: 'Public services',                     hi: 'सार्वजनिक सेवाएँ' },
  navDashboard:     { en: 'Dashboard',                           hi: 'डैशबोर्ड' },
  navCases:         { en: 'Cases',                               hi: 'प्रकरण' },
  navSearch:        { en: 'Search',                              hi: 'खोज' },
  navDeadlines:     { en: 'Statutory deadlines',                 hi: 'वैधानिक समय-सीमा' },
  navWomenSafety:   { en: 'Women Safety',                        hi: 'महिला सुरक्षा' },
  navAudit:         { en: 'Audit trail',                         hi: 'अंकेक्षण अभिलेख' },
  navLedger:        { en: 'Consortium ledger',                   hi: 'कंसोर्टियम बहीखाता' },
  navPolicy:        { en: 'Access policy',                       hi: 'अभिगम नीति' },
  navVerifier:      { en: 'Public verifier',                     hi: 'सार्वजनिक सत्यापक' },
  navCitizen:       { en: 'Citizen portal',                      hi: 'नागरिक पोर्टल' },

  home:             { en: 'Home',                                hi: 'मुखपृष्ठ' },
  signIn:           { en: 'Sign in',                             hi: 'लॉग इन' },
  signOut:          { en: 'Sign out',                            hi: 'लॉग आउट' },
  accessPurpose:    { en: 'Access purpose',                      hi: 'अभिगम प्रयोजन' },
  officerConsole:   { en: 'Officer console',                     hi: 'अधिकारी कंसोल' },

  accessibility:    { en: 'Accessibility statement',             hi: 'सुगम्यता वक्तव्य' },
  terms:            { en: 'Terms and conditions',                hi: 'नियम एवं शर्तें' },
  privacy:          { en: 'Privacy policy',                      hi: 'गोपनीयता नीति' },
  copyright:        { en: 'Copyright policy',                    hi: 'कॉपीराइट नीति' },
  hyperlinking:     { en: 'Hyperlinking policy',                 hi: 'हाइपरलिंकिंग नीति' },
  rti:              { en: 'Right to Information',                hi: 'सूचना का अधिकार' },
  help:             { en: 'Help',                                hi: 'सहायता' },
  feedback:         { en: 'Feedback',                            hi: 'प्रतिक्रिया' },
  sitemap:          { en: 'Sitemap',                             hi: 'साइट मानचित्र' },
  contentManaged:   { en: 'Website content managed by the National Crime Records Bureau, Ministry of Home Affairs',
                      hi: 'वेबसाइट सामग्री का प्रबंधन राष्ट्रीय अपराध रिकॉर्ड ब्यूरो, गृह मंत्रालय द्वारा' },
  lastUpdated:      { en: 'Last updated',                        hi: 'अंतिम अद्यतन' },
  gigwNote:         { en: 'Built to GIGW 3.0 and WCAG 2.1 Level AA',
                      hi: 'GIGW 3.0 एवं WCAG 2.1 स्तर AA के अनुरूप निर्मित' },

  prototypeTitle:   { en: 'Prototype - not an official Government of India website',
                      hi: 'प्रारूप - यह भारत सरकार की आधिकारिक वेबसाइट नहीं है' },
  prototypeBody:    { en: 'Smart India Hackathon 2026 entry for problem statement 26190. All cases, officers and records shown are fictional.',
                      hi: 'स्मार्ट इंडिया हैकाथॉन 2026, समस्या कथन 26190 हेतु प्रविष्टि। यहाँ दर्शाए गए सभी प्रकरण, अधिकारी एवं अभिलेख काल्पनिक हैं।' },
} as const;

export type StringKey = keyof typeof STRINGS;
