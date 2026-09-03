/**
 * Synthetic case corpus.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ EVERY PERSON, CASE, NUMBER AND ADDRESS BELOW IS FICTIONAL.                │
 * │ No real case data is used, and none should ever be loaded into a demo.    │
 * │ Say this out loud in the pitch — it pre-empts the question and shows      │
 * │ ethical judgement.                                                        │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * The corpus is built to exercise the features that matter on stage:
 *   - Hindi and English documents, so cross-script search is genuinely tested.
 *   - A shared phone number across three unrelated cases, so cross-case link
 *     analysis has something real to find.
 *   - Sensitive (POCSO / sexual offence) cases so Women Safety Mode is live.
 *   - Deadlines deliberately placed near breach so the compliance board is not empty.
 */

export type SeedUser = {
  username: string; fullName: string; designation: string; rankLevel: number;
  unit: string; district: string; station: string | null; isWomanOfficer: boolean;
  clearanceLevel: number; role: string;
};

export const USERS: SeedUser[] = [
  { username: 'r.deshmukh', fullName: 'Rohini Deshmukh', designation: 'Sub-Inspector', rankLevel: 3, unit: 'Civil Police', district: 'Nagpur Rural', station: 'Kalmeshwar PS', isWomanOfficer: true, clearanceLevel: 3, role: 'io' },
  { username: 'a.pawar', fullName: 'Amit Pawar', designation: 'Sub-Inspector', rankLevel: 3, unit: 'Civil Police', district: 'Nagpur Rural', station: 'Kalmeshwar PS', isWomanOfficer: false, clearanceLevel: 2, role: 'io' },
  { username: 's.kulkarni', fullName: 'Sneha Kulkarni', designation: 'Police Inspector / SHO', rankLevel: 4, unit: 'Civil Police', district: 'Nagpur Rural', station: 'Kalmeshwar PS', isWomanOfficer: true, clearanceLevel: 3, role: 'sho' },
  { username: 'v.chauhan', fullName: 'Vikram Chauhan', designation: 'Police Inspector / SHO', rankLevel: 4, unit: 'Civil Police', district: 'Wardha', station: 'Hinganghat PS', isWomanOfficer: false, clearanceLevel: 2, role: 'sho' },
  { username: 'm.iyer', fullName: 'Meera Iyer', designation: 'Deputy Superintendent of Police', rankLevel: 5, unit: 'District HQ', district: 'Nagpur Rural', station: null, isWomanOfficer: true, clearanceLevel: 3, role: 'supervisor' },
  { username: 'p.rathore', fullName: 'Prakash Rathore', designation: 'Superintendent of Police', rankLevel: 6, unit: 'District HQ', district: 'Nagpur Rural', station: null, isWomanOfficer: false, clearanceLevel: 3, role: 'supervisor' },
  { username: 'n.banerjee', fullName: 'Nandita Banerjee', designation: 'Assistant Public Prosecutor', rankLevel: 4, unit: 'Directorate of Prosecution', district: 'Nagpur Rural', station: null, isWomanOfficer: true, clearanceLevel: 3, role: 'prosecutor' },
  { username: 'k.mahajan', fullName: 'Kiran Mahajan', designation: 'Scientific Officer, FSL', rankLevel: 4, unit: 'Regional Forensic Science Laboratory', district: 'Nagpur', station: null, isWomanOfficer: false, clearanceLevel: 3, role: 'fsl' },
  { username: 'j.registrar', fullName: 'Anil Sathe', designation: 'Court Registrar', rankLevel: 5, unit: 'District & Sessions Court', district: 'Nagpur Rural', station: null, isWomanOfficer: false, clearanceLevel: 4, role: 'court' },
  { username: 'g.record', fullName: 'Ganesh Tayde', designation: 'Record Room Assistant', rankLevel: 2, unit: 'District Record Room', district: 'Nagpur Rural', station: null, isWomanOfficer: false, clearanceLevel: 1, role: 'records' },
  { username: 'd.security', fullName: 'Divya Nair', designation: 'Chief Information Security Officer', rankLevel: 5, unit: 'State Police IT', district: 'Mumbai', station: null, isWomanOfficer: true, clearanceLevel: 2, role: 'ciso' },
];

export type SeedDocument = {
  title: string; docClass: string; docType: string; language: string;
  mimeType: string; body: string;
  /** simulates a scanned/handwritten page whose text came from OCR */
  handwritten?: boolean;
  sensitivity?: number;
  captureMeta?: Record<string, unknown>;
};

export type SeedCase = {
  caseNumber: string; title: string; sections: string[]; station: string; district: string;
  registeredDaysAgo: number; io: string; status: string;
  victim?: { fullName: string; age?: number; address?: string; phone?: string };
  complainantPhone: string;
  documents: SeedDocument[];
};

const DEVICE = (model: string, officer: string) => ({
  deviceModel: model,
  deviceOs: 'Android 14 (PRAMANA field app)',
  capturedBy: officer,
  attestation: 'hardware-backed key attestation (simulated)',
  gps: '21.2345° N, 78.9876° E (±6 m)',
  captureTimeSource: 'NPL time server via NTP',
});

/** The number that ties three unrelated cases together for link analysis. */
const LINKED_PHONE = '9822014477';

export const CASES: SeedCase[] = [
  {
    caseNumber: 'FIR/2026/0142',
    title: 'Assault and criminal intimidation near Kalmeshwar bus stand',
    sections: ['BNS 115(2)', 'BNS 351(2)'],
    station: 'Kalmeshwar PS', district: 'Nagpur Rural',
    registeredDaysAgo: 84, io: 'a.pawar', status: 'under_investigation',
    complainantPhone: '9730051182',
    documents: [
      {
        title: 'First Information Report — FIR/2026/0142',
        docClass: 'registration', docType: 'fir', language: 'en', mimeType: 'text/plain',
        body: `FIRST INFORMATION REPORT (fictional demonstration record)
Police Station: Kalmeshwar PS, District Nagpur Rural
FIR No: FIR/2026/0142   Sections: BNS 115(2), BNS 351(2)

Complainant states that on the evening of the incident, at approximately 19:40 hours,
near the Kalmeshwar bus stand, three men obstructed his motorcycle, assaulted him with
fists and a wooden stick, and threatened him with further harm if he reported the matter.
The complainant sustained injury to the left forearm and forehead. A maroon motorcycle
bearing registration MH 40 AB 1234 was seen leaving the scene towards the market road.
Contact number provided by the complainant: ${LINKED_PHONE}.
Case registered and investigation taken up by SI Amit Pawar.`,
      },
      {
        title: 'Witness statement — Suresh Wankhede',
        docClass: 'statement', docType: 'witness_statement', language: 'hi', mimeType: 'text/plain',
        handwritten: true,
        body: `गवाह का बयान (काल्पनिक अभिलेख)
मैं सुरेश वानखेड़े, आयु 41 वर्ष, दुकानदार, कालमेश्वर बाजार।

घटना के दिन शाम लगभग सात बजकर चालीस मिनट पर मैं अपनी दुकान बंद कर रहा था। मैंने देखा कि
बस स्टैंड के पास तीन आदमी एक मोटरसाइकिल सवार को रोक रहे थे। उनमें से एक ने लकड़ी के डंडे से
मारपीट की। मोटरसाइकिल का रंग मैरून था और वह प्राथमिक विद्यालय की तरफ चली गई।
मैंने शोर सुनकर पुलिस को फोन किया। मेरा मोबाइल नंबर ${LINKED_PHONE} है।
यह बयान मेरे कथन अनुसार लिखा गया है और मैंने पढ़कर सही पाया।`,
      },
      {
        title: 'Scene photograph — bus stand approach road',
        docClass: 'evidence', docType: 'scene_photograph', language: 'en', mimeType: 'text/plain',
        captureMeta: DEVICE('Field capture device FC-220', 'SI Amit Pawar'),
        body: `SCENE PHOTOGRAPH METADATA RECORD (fictional)
Subject: approach road to Kalmeshwar bus stand, looking north.
Visible: wooden stick recovered at the kerb, scattered debris, tyre marks.
Captured on the PRAMANA field app; hashed and signed on the device before transmission.
This record stands in for the binary image in the demonstration corpus.`,
      },
      {
        title: 'Case diary entry — day 3',
        docClass: 'investigation', docType: 'case_diary', language: 'hi', mimeType: 'text/plain',
        handwritten: true,
        body: `केस डायरी — दिनांक तीसरा दिन (काल्पनिक)
आज घटनास्थल का निरीक्षण किया गया। दो गवाहों के बयान दर्ज किए गए।
मैरून मोटरसाइकिल MH 40 AB 1234 के पंजीकरण विवरण हेतु परिवहन कार्यालय को पत्र भेजा गया।
अस्पताल से चोट प्रमाणपत्र प्राप्त करने हेतु आवेदन दिया गया।
अन्वेषण जारी है।`,
      },
    ],
  },
  {
    caseNumber: 'FIR/2026/0157',
    title: 'Offence against a woman — Kalmeshwar (Sensitive)',
    sections: ['BNS 64', 'BNS 351(3)'],
    station: 'Kalmeshwar PS', district: 'Nagpur Rural',
    registeredDaysAgo: 52, io: 'r.deshmukh', status: 'under_investigation',
    victim: { fullName: 'Ananya Bhosale', age: 24, address: 'Ward 4, Kalmeshwar, Nagpur Rural', phone: '9881245530' },
    complainantPhone: '9881245530',
    documents: [
      {
        title: 'First Information Report — FIR/2026/0157',
        docClass: 'registration', docType: 'fir', language: 'en', mimeType: 'text/plain', sensitivity: 3,
        body: `FIRST INFORMATION REPORT (fictional demonstration record)
Police Station: Kalmeshwar PS, District Nagpur Rural
FIR No: FIR/2026/0157   Sections: BNS 64, BNS 351(3)

Information received from the complainant at the police station. The complainant is
referred to throughout this record by her system-assigned pseudonym; her identifying
particulars are held in the Victim Identity Vault and are not reproduced in any working
document, index entry, notification or export.

The information discloses a cognisable offence. The case has been escalated automatically
to Sensitive Case Mode. Statement recording assigned to SI Rohini Deshmukh, woman police
officer, as required. Medical examination arranged at the district hospital.`,
      },
      {
        title: 'Victim statement (recorded by woman police officer)',
        docClass: 'statement', docType: 'victim_statement', language: 'hi', mimeType: 'text/plain',
        handwritten: true, sensitivity: 3,
        body: `पीड़िता का बयान (काल्पनिक अभिलेख — पहचान सुरक्षित)
यह बयान महिला पुलिस अधिकारी द्वारा दर्ज किया गया है।

पीड़िता ने बताया कि घटना रात लगभग साढ़े नौ बजे हुई। वह विद्यालय के पास वाली सड़क से घर लौट रही थी।
एक व्यक्ति ने उसका रास्ता रोका और धमकी दी। पीड़िता ने शोर मचाया जिससे आसपास के लोग एकत्र हुए।
पीड़िता को चोट आई और उसे अस्पताल ले जाया गया।
पीड़िता की पहचान संबंधी विवरण इस अभिलेख में दर्ज नहीं किए गए हैं।`,
      },
      {
        title: 'Medical examination report (MLC)',
        docClass: 'forensic', docType: 'medical_report', language: 'en', mimeType: 'text/plain', sensitivity: 3,
        body: `MEDICAL EXAMINATION REPORT (fictional demonstration record)
District Hospital, Nagpur Rural — Medico-Legal Case

Examination conducted with informed consent, in the presence of a woman attendant.
Findings recorded on the prescribed proforma. Samples collected and sealed for forensic
examination; the seal numbers are recorded in the accompanying seizure memo.
Report forwarded to the investigating officer within the statutory period.
The examined person is identified in this report only by the case pseudonym.`,
      },
      {
        title: 'Forensic science laboratory report',
        docClass: 'forensic', docType: 'fsl_report', language: 'en', mimeType: 'text/plain', sensitivity: 3,
        body: `REGIONAL FORENSIC SCIENCE LABORATORY, NAGPUR (fictional demonstration record)
Examination report on exhibits received under sealed cover.

Exhibits received with seals intact and matching the seal impressions forwarded by the
investigating officer. Examination conducted as per laboratory protocol.
Results are recorded in the enclosed annexure. Exhibits resealed and returned.
Chain of custody for each exhibit is recorded in the accompanying custody ledger.`,
      },
      {
        title: 'Seizure memo — sealed sample packets',
        docClass: 'investigation', docType: 'seizure_memo', language: 'en', mimeType: 'text/plain', sensitivity: 3,
        body: `SEIZURE MEMO (fictional demonstration record)
Articles seized and sealed in the presence of two independent witnesses.
Each packet bears a numbered seal; impressions taken on a separate sheet.
Custody handed to the malkhana in-charge pending despatch to the laboratory.`,
      },
    ],
  },
  {
    caseNumber: 'FIR/2026/0163',
    title: 'Offence against a child — Hinganghat (POCSO, Sensitive)',
    sections: ['POCSO 8', 'BNS 74'],
    station: 'Hinganghat PS', district: 'Wardha',
    registeredDaysAgo: 41, io: 'r.deshmukh', status: 'under_investigation',
    victim: { fullName: 'Minor (guardian: Sunita Kamble)', age: 13, address: 'Hinganghat, Wardha', phone: '9765009812' },
    complainantPhone: '9765009812',
    documents: [
      {
        title: 'First Information Report — FIR/2026/0163',
        docClass: 'registration', docType: 'fir', language: 'en', mimeType: 'text/plain', sensitivity: 4,
        body: `FIRST INFORMATION REPORT (fictional demonstration record)
Police Station: Hinganghat PS, District Wardha
FIR No: FIR/2026/0163   Sections: POCSO 8, BNS 74

The child victim is referred to solely by the system-assigned pseudonym. Identity
particulars, including those of the guardian, are held in the Victim Identity Vault.
Disclosure of a child victim's identity is an offence; the system does not display the
name to any user, at any rank, without dual authorisation and a recorded waiting period.

Case escalated automatically to Sensitive Case Mode on registration.
Support person appointment and child welfare committee intimation initiated.`,
      },
      {
        title: 'Statement of the child victim',
        docClass: 'statement', docType: 'victim_statement', language: 'hi', mimeType: 'text/plain',
        handwritten: true, sensitivity: 4,
        body: `बालिका का बयान (काल्पनिक अभिलेख — पहचान पूर्णतः सुरक्षित)
यह बयान महिला पुलिस अधिकारी द्वारा, अभिभावक की उपस्थिति में, बालिका के घर पर दर्ज किया गया।
बालिका ने घटना का विवरण अपने शब्दों में बताया। बयान बालिका को पढ़कर सुनाया गया।
इस अभिलेख में बालिका अथवा अभिभावक की पहचान संबंधी कोई विवरण दर्ज नहीं है।`,
      },
      {
        title: 'Support person appointment record',
        docClass: 'administrative', docType: 'support_person', language: 'en', mimeType: 'text/plain', sensitivity: 3,
        body: `SUPPORT PERSON APPOINTMENT (fictional demonstration record)
A support person has been appointed to assist the child and the family through the
investigation and trial, and the Child Welfare Committee has been intimated.
Compensation scheme eligibility has been flagged for the district legal services authority.`,
      },
    ],
  },
  {
    caseNumber: 'FIR/2026/0171',
    title: 'House theft and receiving of stolen property — Hinganghat',
    sections: ['BNS 305', 'BNS 317(2)'],
    station: 'Hinganghat PS', district: 'Wardha',
    registeredDaysAgo: 26, io: 'a.pawar', status: 'under_investigation',
    complainantPhone: '9421778890',
    documents: [
      {
        title: 'First Information Report — FIR/2026/0171',
        docClass: 'registration', docType: 'fir', language: 'en', mimeType: 'text/plain',
        body: `FIRST INFORMATION REPORT (fictional demonstration record)
Police Station: Hinganghat PS, District Wardha
FIR No: FIR/2026/0171   Sections: BNS 305, BNS 317(2)

Complainant reports that gold ornaments and cash were removed from a locked house
between 11:00 and 17:00 hours. The rear window latch was found broken.
A neighbour reports seeing an unfamiliar maroon motorcycle, registration partially noted
as MH 40 AB 1234, parked in the lane during the afternoon.
A mobile number recovered from a note at the scene reads ${LINKED_PHONE}.`,
      },
      {
        title: 'Site plan and seizure memo',
        docClass: 'investigation', docType: 'seizure_memo', language: 'en', mimeType: 'text/plain',
        body: `SITE PLAN AND SEIZURE MEMO (fictional demonstration record)
Point of entry marked at the rear window. Latch and fragments seized and sealed.
Fingerprint lifting attempted on the window frame and the almirah handle.
Articles listed and sealed in the presence of two independent witnesses.`,
      },
      {
        title: 'बयान — पड़ोसी का कथन',
        docClass: 'statement', docType: 'witness_statement', language: 'hi', mimeType: 'text/plain',
        handwritten: true,
        body: `पड़ोसी का बयान (काल्पनिक अभिलेख)
दोपहर करीब तीन बजे मैंने गली में एक लाल-मैरून रंग की मोटरसाइकिल खड़ी देखी।
उस पर दो लोग थे, एक ने काली जैकेट पहनी थी। वे बाजार की तरफ चले गए।
गाड़ी का नंबर पूरा नहीं देख पाया, शुरुआत MH 40 थी।`,
      },
    ],
  },
  {
    caseNumber: 'FIR/2026/0180',
    title: 'Cyber-enabled harassment and criminal intimidation',
    sections: ['BNS 351(3)', 'BNS 79', 'IT Act 66E'],
    station: 'Kalmeshwar PS', district: 'Nagpur Rural',
    registeredDaysAgo: 63, io: 'r.deshmukh', status: 'under_investigation',
    victim: { fullName: 'Priyanka Sawant', age: 27, address: 'Kalmeshwar, Nagpur Rural', phone: '9860112244' },
    complainantPhone: '9860112244',
    documents: [
      {
        title: 'First Information Report — FIR/2026/0180',
        docClass: 'registration', docType: 'fir', language: 'en', mimeType: 'text/plain', sensitivity: 3,
        body: `FIRST INFORMATION REPORT (fictional demonstration record)
Police Station: Kalmeshwar PS, District Nagpur Rural
FIR No: FIR/2026/0180   Sections: BNS 351(3), BNS 79, IT Act 66E

The complainant reports receiving repeated threatening messages and the circulation of
private images without consent. The complainant is referred to by pseudonym throughout.
Preservation requests have been issued to the intermediary platforms.
The originating number recorded in the complaint is ${LINKED_PHONE}.`,
      },
      {
        title: 'Device extraction summary',
        docClass: 'forensic', docType: 'cyber_forensics', language: 'en', mimeType: 'text/plain', sensitivity: 3,
        body: `CYBER FORENSICS EXTRACTION SUMMARY (fictional demonstration record)
Handset received under seal. Logical extraction performed using a write-blocked workstation.
Hash of the extraction image recorded at acquisition and re-verified after transfer.
Message threads and call records exported to the case file as separate sealed artefacts.
No content is reproduced in this summary.`,
      },
    ],
  },
  {
    caseNumber: 'FIR/2025/0904',
    title: 'Cheating and criminal breach of trust — closed, pending appeal',
    sections: ['BNS 318(4)', 'BNS 316(2)'],
    station: 'Kalmeshwar PS', district: 'Nagpur Rural',
    registeredDaysAgo: 400, io: 'a.pawar', status: 'chargesheet_filed',
    complainantPhone: '9096551237',
    documents: [
      {
        title: 'Charge sheet — FIR/2025/0904',
        docClass: 'prosecution', docType: 'chargesheet', language: 'en', mimeType: 'text/plain',
        body: `FINAL REPORT / CHARGE SHEET (fictional demonstration record)
Submitted before the Court of the Judicial Magistrate First Class, Nagpur Rural.

The investigation establishes that the accused induced the complainant to transfer funds
on a false representation and thereafter failed to account for them.
Documentary evidence, bank records and witness statements are annexed and paginated.
Each annexure carries its own integrity manifest and evidence certificate.`,
      },
      {
        title: 'Bank statement annexure',
        docClass: 'prosecution', docType: 'annexure', language: 'en', mimeType: 'text/plain',
        body: `BANK STATEMENT ANNEXURE (fictional demonstration record)
Account 50100234567891 — transactions extracted for the relevant period.
Certified copy received from the bank through the secure intake portal.`,
      },
    ],
  },
];

export const LINKED_PHONE_NUMBER = LINKED_PHONE;
