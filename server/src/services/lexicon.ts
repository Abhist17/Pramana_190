/**
 * Curated English <-> Hindi policing and legal lexicon.
 *
 * True multilingual retrieval is not a nice-to-have in Indian policing: an
 * officer searches in English and the statement he needs was handwritten in
 * Hindi. Production PRAMANA gets this from a multilingual encoder (MuRIL /
 * IndicBERT) whose embedding space is shared across scripts.
 *
 * This lexicon is the honest stand-in: it gives genuine cross-script recall over
 * the vocabulary that actually matters in a case file, with no model download and
 * no GPU. Both search and the embedding function expand through it, so a query in
 * either language reaches documents in the other.
 */
export const BILINGUAL_LEXICON: Record<string, string[]> = {
  // people and roles
  witness: ['गवाह', 'साक्षी'], victim: ['पीड़िता', 'पीड़ित'], accused: ['आरोपी', 'अभियुक्त'],
  complainant: ['शिकायतकर्ता'], officer: ['अधिकारी'], police: ['पुलिस'], inspector: ['निरीक्षक'],
  constable: ['आरक्षक'], doctor: ['चिकित्सक', 'डॉक्टर'], magistrate: ['मजिस्ट्रेट'], court: ['न्यायालय', 'अदालत'],
  woman: ['महिला'], child: ['बालक', 'बच्चा'], girl: ['लड़की', 'बालिका'], man: ['पुरुष', 'आदमी'],
  // documents
  statement: ['बयान', 'कथन'], report: ['रिपोर्ट', 'प्रतिवेदन'], chargesheet: ['आरोपपत्र'],
  fir: ['प्राथमिकी', 'एफआईआर'], diary: ['डायरी', 'केसडायरी'], memo: ['ज्ञापन'],
  seizure: ['जब्ती', 'जप्ती'], arrest: ['गिरफ्तारी'], warrant: ['वारंट'], summons: ['समन'],
  medical: ['चिकित्सा', 'मेडिकल'], forensic: ['न्यायालयिक', 'फोरेंसिक'], postmortem: ['शवपरीक्षण'],
  photograph: ['छायाचित्र', 'फोटो'], evidence: ['साक्ष्य', 'सबूत', 'प्रमाण'], exhibit: ['प्रदर्श'],
  // acts and places
  theft: ['चोरी'], robbery: ['डकैती', 'लूट'], assault: ['हमला', 'मारपीट'], murder: ['हत्या'],
  rape: ['बलात्कार'], harassment: ['उत्पीड़न'], kidnapping: ['अपहरण'], trafficking: ['तस्करी'],
  fraud: ['धोखाधड़ी'], cheating: ['छल'], threat: ['धमकी'], injury: ['चोट'], death: ['मृत्यु'],
  scene: ['घटनास्थल'], house: ['मकान', 'घर'], road: ['सड़क', 'मार्ग'], school: ['विद्यालय', 'स्कूल'],
  hospital: ['अस्पताल'], station: ['थाना'], village: ['गाँव', 'ग्राम'], district: ['जिला'],
  market: ['बाजार'], shop: ['दुकान'], bank: ['बैंक'],
  // things
  vehicle: ['वाहन', 'गाड़ी'], motorcycle: ['मोटरसाइकिल'], car: ['कार'], phone: ['फोन', 'मोबाइल'],
  knife: ['चाकू'], money: ['रुपये', 'धन'], gold: ['सोना'], bag: ['बैग', 'थैला'],
  red: ['लाल'], maroon: ['मैरून', 'लाल'], black: ['काला'], white: ['सफेद'], blue: ['नीला'],
  // process
  investigation: ['अन्वेषण', 'जांच'], complaint: ['शिकायत'], recorded: ['दर्ज'],
  night: ['रात'], morning: ['सुबह'], evening: ['शाम'], date: ['दिनांक'], time: ['समय'],
};

/** Reverse index, built once: Hindi surface form -> English head words. */
const REVERSE: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [english, hindiForms] of Object.entries(BILINGUAL_LEXICON)) {
    for (const hindi of hindiForms) {
      const existing = map.get(hindi) ?? [];
      existing.push(english);
      map.set(hindi, existing);
    }
  }
  return map;
})();

/** Returns the cross-language expansions of a single token (never the token itself). */
export function expand(token: string): string[] {
  const lower = token.toLowerCase();
  return [...(BILINGUAL_LEXICON[lower] ?? []), ...(REVERSE.get(token) ?? [])];
}
