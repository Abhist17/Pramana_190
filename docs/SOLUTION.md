# PRAMANA
### Secure Digital Document Management System for Legal and Investigation Documents

**Smart India Hackathon - Problem Statement 26190**
Ministry of Home Affairs · National Crime Records Bureau (NCRB), Women Safety Division
Category: Software · Theme: Blockchain & Cybersecurity

---

## 0. How to use this document

This is a working document, not a submission. It contains more than you will present. The intended flow is:

1. Read Sections 1-3 to internalise the problem well enough to explain it to a judge who has never heard of CCTNS.
2. Use Sections 4-6 for the "audience" and "data" slides.
3. Use Sections 7-13 to decide *what you are actually building in 36 hours* versus what you are describing as roadmap.
4. Section 17 is the honest scoping exercise. Do that one early, not the night before.

**Name.** `PRAMANA` (प्रमाण) - Sanskrit/legal term meaning *proof, valid means of knowledge, evidence*. It is the exact word used in Indian jurisprudence for a means of establishing truth, and it backronyms cleanly:

> **P**rovenance, **R**etention, **A**ccess **M**anagement **A**nd **N**otarised **A**rchive

Alternates if you want something else: **SAKSHYA-SETU** (evidence bridge), **NYAYA-KOSH** (justice repository), **ADHIKAR** (authority/right). Pick one in the first hour and stop debating it.

---

## 1. Reading the problem statement carefully

### 1.1 What is actually being asked

Strip the marketing language and the ask is four things, in priority order:

| # | Requirement | What it really means |
|---|---|---|
| 1 | **Integrity** | Prove a document has not been altered since it was created, and prove it in a way a court will accept. |
| 2 | **Confidentiality** | Only the right person sees a document, and every look is recorded. |
| 3 | **Findability** | A twelve-year-old case file, partly handwritten, partly in Hindi, is retrievable in seconds. |
| 4 | **Auditability** | Reconstruct the complete life history of any document - who touched it, when, why, from where. |

Everything else (collaboration, workflow, dashboards) is downstream of these four.

### 1.2 The anomaly you must address

The "Expected Solution" field says:

> *"Develop a system to monitor and manage police assets throughout their lifecycle."*

This does not match the description. It is almost certainly copy-paste residue from a different problem statement - this happens routinely in SIH listings. **Do not ignore it and do not build an asset tracker.** Handle it in one line, early in your pitch:

> "We read the expected-solution line as *lifecycle management* - and we treat every document as a custodial asset. A charge sheet has an owner, a custody chain, a location, a condition, a retention period and a disposal date, exactly like a seized weapon in a malkhana. Our system manages that lifecycle. If the evaluators intended physical asset tracking, our custody ledger extends to physical evidence with one additional entity type - and we have modelled that."

This converts a liability into a demonstration that you read the brief carefully. Then move on.

### 1.3 Why the sponsoring department matters

The department is not just NCRB - it is the **Women Safety Division**. That is a deliberate signal and most teams will miss it.

The Women Safety Division owns the systems around sexual offences, cybercrime against women and children, and victim protection. That means your document management system is being judged partly on whether it handles **the most sensitive class of case file in Indian policing**: rape, POCSO, domestic violence, trafficking, cyber-harassment.

Those files carry legal obligations no generic DMS satisfies:

- The victim's identity is legally protected. Disclosure is a criminal offence.
- Certain statements must be recorded by a woman officer.
- Investigation has a statutory deadline measured in weeks, not years.
- Medical reports have their own forwarding deadlines.
- Courts routinely order material into sealed cover.

We build a dedicated module for this (Section 11). It is the single strongest differentiator available to you, and it costs relatively little to demo.

---

## 2. The problem in plain language

*(This section is written so a non-technical judge, a police officer, or your own teammate's parent can follow it. Use this language in the pitch.)*

### 2.1 Follow one case file

A woman walks into a police station in a district town and reports an assault. Here is what happens to the paper.

**Day 1.** The duty officer writes an FIR by hand in a register, then types the same information into a computer terminal. A carbon copy goes into a physical case bundle tied with string. A photocopy is supposed to go to the complainant.

**Day 3.** The investigating officer records witness statements - handwritten, in the local language, on loose sheets. He photographs the scene on his personal phone. The photos sit in his gallery next to family pictures. He shares three of them on WhatsApp with his supervisor, who forwards them to a colleague, who forwards them again.

**Day 12.** A medical examination report arrives from the district hospital as a scanned PDF on a shared email account whose password four people know. Someone prints it and adds it to the bundle.

**Day 40.** The officer is transferred. He hands over a physical file to his successor. Two loose sheets are missing. Nobody can say when they went missing or whether they ever existed, because there was never a list of what the file contained.

**Day 90.** The complainant asks about progress. There is no way to answer without physically locating the file, which is in a different officer's drawer.

**Month 8.** The charge sheet is filed. Court staff re-scan the entire bundle to create the court record. Page numbers do not match the police copy, so every reference in the charge sheet points to the wrong page.

**Year 3.** The defence challenges a photograph. The prosecution must prove the photograph is the same one taken at the scene and has not been altered. The officer who took it has retired. The phone has been replaced. There is no hash, no timestamp, no device record. The photograph is doubted.

**Year 5.** The file is needed for an appeal. It is in a record room where humidity and rodents have been at work.

**No single step here is a scandal. The accumulation is the problem.**

### 2.2 The seven failures, named

**1. You cannot find things.**
Documents live in physical bundles, on personal laptops, in shared email inboxes, on WhatsApp, in three unconnected software systems, and in record rooms. There is no index. Finding a specific witness statement from 2019 can take days. Officers routinely re-create documents because locating the original is slower than rewriting it.

**2. The wrong people can see confidential material.**
Access control is physical - a locked cupboard, a shared password. There is no concept of "this officer may see this case but not that one." Anyone with the shared drive credential sees everything. Leaked material from sensitive cases reaching the media is a recurring, well-documented problem, and because everyone had access, nobody can be identified as the leaker.

**3. Documents can be altered, and alteration cannot be disproved.**
A Word file can be edited and re-saved with no trace. A scan can be replaced. A page can be removed from a bundle. Even when nothing has been tampered with, the *defence only has to raise doubt*. Without cryptographic proof, "this could have been altered" is a live argument, and it works.

**4. There is no version control.**
A charge sheet goes through eleven drafts. They are named `chargesheet_final.docx`, `chargesheet_final_v2.docx`, `chargesheet_FINAL_use_this.docx`. The wrong version gets filed. There is no way to see what changed between drafts or who changed it.

**5. Departments cannot collaborate.**
Police, prosecution, forensic labs, courts and prisons each run separate systems. Material moves between them as paper, email attachments, or courier. Each handoff loses metadata, introduces delay, and creates a fresh copy that immediately begins to diverge from the original.

**6. Everything is slow, and delay is not neutral.**
India's court backlog is measured in crores of pending cases. A meaningful share of adjournments trace back to records not being ready, documents not being served, or files being untraceable. For a victim, an eight-month delay in filing a charge sheet is not an administrative statistic - it is eight months of the accused being at large.

**7. There is no audit trail, so there is no accountability.**
Nobody can answer: who opened this file? Who printed it? Who copied it to a pen drive at 2 a.m.? Was anything deleted? Without answers, you cannot detect insider misuse, you cannot prove compliance, and you cannot defend the record's integrity in court.

### 2.3 Why cryptography is the right tool, explained without jargon

Two ideas do most of the work. Explain them like this:

**A digital fingerprint (hash).**
Feed any file through a standard mathematical function and you get a short string - say 64 characters. Change a single pixel, a single comma, a single bit, and that string changes completely and unpredictably. You cannot work backwards from the fingerprint to the file, and you cannot construct a different file with the same fingerprint. So: record the fingerprint when the document is created, and forever after, anyone can re-compute the fingerprint of the file they are holding and compare. Match means untouched. Mismatch means altered. It takes milliseconds.

**A ledger nobody can quietly rewrite (blockchain).**
Fingerprints are only useful if the *record of the fingerprint* is itself trustworthy. If the fingerprint sits in a normal database, whoever controls that database can change it. So we write the fingerprint to a shared ledger jointly operated by parties who do not fully trust each other - NCRB, the State CID, the judiciary, the forensic labs, the prosecution. Each holds a copy. Each new entry is cryptographically linked to the previous one. To alter a past entry you would have to simultaneously compromise a majority of independent institutions and rewrite everything since - which is not realistically achievable, and any attempt is immediately visible.

**The combination is the point.** The document itself never goes on the ledger - it stays encrypted in secure government storage. Only the fingerprint, the timestamp, and the custody event go on-chain. So the ledger proves *what existed and when*, while leaking nothing about *what it said*.

The courtroom sentence you want a judge to be able to say:

> "The prosecution has produced a photograph whose fingerprint was recorded on an independently-operated ledger at 14:32 on 3 April, two hours after the incident, signed by the officer's digital certificate. The photograph before this court produces the identical fingerprint. It has not been altered."

---

## 3. Why now - the legal and policy tailwind

This is important and most teams will not know it. India's criminal law was rewritten in 2023, effective 1 July 2024, and the new statutes **explicitly assume digital evidence infrastructure**. You are not proposing something ahead of the law. You are proposing the thing the law now requires and which does not yet properly exist.

> **Verify every provision below against the bare Act before you put it on a slide.** I do not have web access and cannot check citations; treat these as leads, not as verified quotations. Section numbers in particular should be confirmed on indiacode.nic.in.

### 3.1 Bharatiya Sakshya Adhiniyam (BSA), 2023 - the evidence law

- **Electronic records are documents.** Electronic records are given the same legal standing as paper documents, removing the older ambiguity about whether a digital file is primary or secondary evidence.
- **The certificate requirement (widely discussed as the successor to the old Section 65B certificate).** Electronic evidence must be accompanied by a prescribed certificate. Critically, **the prescribed format asks for the hash value of the electronic record and the algorithm used.**

This last point is the most important fact in this entire document. **The law now asks for a hash.** Your system generates that certificate automatically, pre-filled, at the moment of upload - not reconstructed from memory three years later by an officer who no longer works there. This one feature, demoed live, is worth more than any dashboard.

- The certificate is to be signed both by the person in charge of the device and by an expert. Model this as a **dual-signature workflow** in the product.

### 3.2 Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 - the procedure law

Provisions that map directly to features:

| Theme | Obligation (verify exact section) | Feature it justifies |
|---|---|---|
| **e-FIR / Zero FIR** | Information may be given electronically; must be signed within three days | Digital intake with deferred signature workflow |
| **Audio-video recording of search and seizure** | Search and seizure to be recorded on audio-video electronic means and forwarded to the Magistrate without delay | Video ingestion, hashing, sealed transmission to court |
| **Mandatory forensic visit** | Forensic team visit and videography for offences punishable with seven years or more | Forensic report linkage, video custody chain |
| **Progress intimation to informant** | Informant/victim to be informed of investigation progress within ninety days, including by electronic means | Automated 90-day progress notification with delivery receipt |
| **Supply of copies** | Copies of FIR, statements, charge sheet etc. to accused and victim within fourteen days | One-click redacted disclosure pack, deadline tracker |
| **Time limits for sexual offence investigation** | Investigation in rape cases to be completed within two months of recording information | Statutory countdown dashboard with escalation |
| **Medical examination report** | Report to be forwarded within a stipulated period | Deadline tracking and auto-escalation |
| **Proceedings in electronic mode** | Trials, inquiries and proceedings may be held in electronic mode | Court-ready electronic bundle export |

**The insight to state out loud:** the new law creates roughly a dozen hard deadlines and several new mandatory digital artefacts. Nobody has built the compliance layer for them. Police stations are tracking two-month statutory deadlines on paper registers. That is the gap.

### 3.3 The rest of the compliance surface

- **Information Technology Act, 2000** - legal recognition of digital signatures; the Controller of Certifying Authorities (CCA) licenses the CAs that issue the Class 3 DSC tokens officers already use; **eSign** provides Aadhaar-based online signing.
- **DPDP Act, 2023** - data fiduciary obligations, purpose limitation, security safeguards. State instrumentalities have carve-outs for law-enforcement purposes, but designing to the standard anyway is both good practice and a strong pitch point.
- **CERT-In Directions (April 2022)** - logs to be retained for 180 days **within India**, incident reporting within six hours, system clocks synchronised to NIC/NPL time servers. Your audit log design must satisfy this; mention NTP sync explicitly, it signals seriousness.
- **Public Records Act, 1993** and state police manual record-retention schedules - records are classified by retention class and must be preserved or destroyed on schedule, with a record of destruction.
- **Bharatiya Nyaya Sanhita** - disclosure of the identity of a victim of specified sexual offences is itself an offence. **POCSO Act** similarly protects a child's identity. The Supreme Court's directions in *Nipun Saxena v. Union of India* (2018) on victim identity protection and sealed-cover handling are the governing guidance. **Verify this case citation.**

### 3.4 Existing government systems - integrate, do not duplicate

Know these. A judge from NCRB will ask.

- **CCTNS** (Crime and Criminal Tracking Network & Systems) - NCRB's national backbone connecting roughly sixteen thousand police stations. Handles FIR registration and the Integrated Investigation Forms (commonly referenced as IF-1 through IF-5: FIR, crime details, arrest/surrender, property seizure, final report). **This is where your documents originate.** You are not replacing CCTNS. You are the document and evidence layer beside it.
- **ICJS** (Inter-operable Criminal Justice System) - the national platform connecting the five pillars: police, courts, prosecution, prisons, forensics. **This is your integration bus.** Say "we plug into ICJS" and you have answered the interoperability question.
- **eCourts / CIS / NJDG / e-filing** - the judicial side.
- **eSakshya** - NCRB's application for recording crime-scene and search-seizure video under the new BNSS videography requirements. **Know this exists.** Your position is that eSakshya captures; PRAMANA is where the captured material is sealed, versioned, custody-tracked, retained and produced. Explicitly saying "we integrate with eSakshya rather than rebuild it" will land very well.
- **ITSSO** (Investigation Tracking System for Sexual Offences), **NDSO** (National Database of Sexual Offenders), **CCPWC / cybercrime.gov.in**, **ERSS-112** - all Women Safety Division adjacent.
- **DigiLocker** - for pushing legal notices, FIR copies and orders to a citizen's verified locker.
- **NIC Cloud / MeghRaj**, MeitY-empanelled cloud providers - where this would actually be hosted. Data stays in India, on government infrastructure. Say this.

**Your one-line positioning:**

> "CCTNS records that a crime happened. eCourts records that a trial happened. Nothing owns the *documents* in between - their integrity, their custody, their confidentiality, their retention. PRAMANA is that missing layer, and it speaks ICJS at both ends."

---

## 4. Target audience

### 4.1 Primary users

| Persona | Who they are | Their day today | What PRAMANA gives them |
|---|---|---|---|
| **Investigating Officer (IO)** - Sub-Inspector / Inspector | Runs 30-60 live cases at once. Field-heavy, low patience for software, often poor connectivity. | Handwrites statements, photographs scenes on a personal phone, carries physical bundles, misses deadlines because nothing reminds him. | Mobile capture that hashes and seals evidence at the moment of creation. One case workspace. Deadline alerts. Never re-types the same fact twice. |
| **Station House Officer (SHO)** | Accountable for every case in the station. | No visibility until something goes wrong. | Station dashboard: which cases are near statutory deadline, which files are incomplete, who accessed what. |
| **Supervisory officer (DSP / SP / DIG)** | Reviews investigations, approves charge sheets, answers to courts and the public. | Reviews on paper, signs on paper, has no aggregate view. | Digital approval workflow with DSC signing. District-level compliance dashboard. Insider-misuse alerts. |
| **Public Prosecutor** | Receives the case file, argues it in court. | Receives an incomplete, unindexed bundle days before hearing. | A complete, paginated, indexed, hyperlinked electronic brief. Auto-generated evidence certificates. Ability to request missing material through the system. |
| **Forensic Science Lab officer** | Examines exhibits, issues reports. | Reports travel by courier or unsecured email; sample custody recorded on paper. | Direct sealed exchange with the IO. Custody transfer logged and signed. Report delivered with integrity proof attached. |
| **Court staff / Judicial officer** | Receives filings, maintains the record. | Re-scans everything the police already scanned. Pagination diverges. | Receives a sealed, verified electronic bundle. One-click verification that nothing was altered in transit. Sealed-cover handling that actually stays sealed. |
| **Record room / archives staff** | Custodians of the physical past. | Manual registers, physical degradation, no retention enforcement. | Digital retention schedule, automated disposal proposals, certificate of destruction, legal-hold override. |
| **Departmental IT / CISO** | Runs the system, answers for breaches. | Fragmented tooling, no central log. | Central policy engine, SIEM integration, CERT-In-compliant logging, key management. |

### 4.2 Institutional and citizen beneficiaries

| Stakeholder | Benefit |
|---|---|
| **NCRB** | National visibility into document-level compliance, not just crime statistics. A dataset of process quality, not just outcomes. |
| **Women Safety Division** | Enforceable victim-identity protection. Statutory-deadline monitoring for sexual offence investigations. Auditable proof that confidentiality obligations were met. |
| **The judiciary** | Fewer adjournments from missing records. Evidence arriving with integrity proof attached. Reduced trial time lost to authentication disputes. |
| **The complainant / victim** | Legally-mandated 90-day progress updates delivered automatically. FIR copy available on demand. Identity protected by system design, not by an officer remembering to protect it. |
| **The accused** | Timely supply of documents as the law requires. A record that cannot be quietly padded after the fact - integrity protection cuts both ways, and saying this out loud shows you have thought about fairness, not just prosecution convenience. |
| **Oversight bodies - NHRC, State Human Rights Commissions, courts hearing custody matters** | An audit trail that can be examined. |
| **RTI applicants** | Faster, cleaner responses with reliable exemption handling. |

### 4.3 Who must be designed *against*

State this explicitly in the pitch. It signals security maturity.

- **The malicious insider.** The single largest realistic threat. An officer with legitimate credentials leaking a sensitive case file to media or to the accused. Everything about the access and audit design targets this person.
- **The pressured insider.** An officer instructed by someone senior to make a document quietly disappear. Immutable anchoring means the deletion is provable even if the file goes.
- **The external attacker.** Ransomware against a state police data centre is not hypothetical. WORM storage plus off-chain anchoring means you can prove what existed even if the primary store is encrypted by an attacker.
- **The future defence counsel.** Every design decision should survive the question *"can you prove that?"* asked five years later by someone paid to find the gap.

---

## 5. Data

### 5.1 What flows through the system

**Document classes** (this is your taxonomy - build the schema around it):

| Class | Examples | Format reality | Sensitivity |
|---|---|---|---|
| **Registration** | FIR, Zero FIR, General Diary entries, NCR | Structured (CCTNS) + scanned signed copy | Medium; public copy exists |
| **Investigation** | Case diary, site plan, seizure memo, arrest memo, search warrant, inquest report | Handwritten, vernacular, scanned | High |
| **Statements** | Witness statements, victim statement, magistrate-recorded statements, confessions | Handwritten, vernacular, sometimes audio/video | Very high |
| **Evidence artefacts** | Scene photographs, CCTV, seizure video, phone extraction dumps, audio | Binary, large (GB-scale video) | Very high; integrity-critical |
| **Forensic** | FSL reports, DNA reports, ballistics, cyber-forensics, medical examination reports | PDF, lab-generated | Very high |
| **Prosecution** | Charge sheet, final report, supplementary charge sheet, legal opinions | Composite documents | High |
| **Judicial** | Court filings, summons, warrants, orders, judgments, bail orders | PDF, court-generated | Mixed; judgments largely public |
| **Administrative** | Transfer/handover memos, sanction orders, notices, correspondence | Office formats | Low-medium |

**Non-document data the system also holds:**

- **Entities** - persons (accused, victim, witness, officer), organisations, locations, vehicles, phone numbers, bank accounts, devices.
- **Case metadata** - sections invoked, jurisdiction, stage, statutory deadlines, linked cases.
- **Custody events** - the ledger of who held what, when, and why.
- **Audit events** - every view, download, print, share, edit, export, failed access attempt.
- **Cryptographic material** - hashes, Merkle proofs, signatures, timestamps, on-chain transaction references.
- **AI-derived metadata** - OCR text, extracted entities, classifications, embeddings. **Stored in a separate namespace, never written back into the original.**

### 5.2 Sensitivity classification

Five levels, driving every access, retention and export decision:

| Level | Label | Handling |
|---|---|---|
| 0 | **Public** | Published judgments, FIR copies to informant. Standard encryption. |
| 1 | **Internal** | Routine administrative. Department-wide access. |
| 2 | **Restricted** | Standard case material. Case-team access only. |
| 3 | **Confidential** | Sexual offences, POCSO, trafficking, ongoing operations. Identity vault active, watermarking mandatory, no bulk export. |
| 4 | **Sealed** | Court-ordered sealed cover, protected witness identities, source information. **Encrypted such that no single individual can decrypt** - requires m-of-n threshold approval. |

Level 4 is where you reuse a pattern you already know how to build: threshold custody with guardians, a mandatory waiting period, and human approval before unsealing. The same architecture that protects a recoverable asset protects a sealed court record. It maps almost one-to-one.

### 5.3 Where data comes from in production

```
CCTNS  ──────── FIR, IF-1..IF-5, case metadata (structured pull via ICJS)
eSakshya ────── search/seizure video, crime scene video
Field mobile ── photographs, audio, video, statements (captured in-app)
Scanners ────── legacy paper backfile, handwritten case diaries
FSL LIMS ────── forensic reports
Hospitals ───── medical examination reports (MLC)
eCourts/CIS ─── orders, summons, warrants, judgments
eProsecution ── opinions, filings
ePrisons ────── custody records
DigiLocker ──── outbound: notices, FIR copies, orders to citizens
```

Two ingestion realities to design for:

1. **Backfile digitisation.** Decades of paper. Bulk scan → OCR → auto-classify → auto-link to case → human verification queue. This is where OCR quality on handwritten Devanagari actually matters.
2. **Born-digital capture.** New material captured directly in the app, hashed and signed **on the device before it ever transits a network**. This is strictly better evidence than anything scanned later, and it is the strongest argument for the mobile app existing.

### 5.4 Where data comes from for the hackathon

**You will not have real case data. You must not use real case data.** Say this explicitly in the pitch - it demonstrates ethical judgement and pre-empts the question.

**Layer 1 - Real public documents (for OCR, NLP, and realism):**
- Supreme Court and High Court judgments - publicly available in full text, many with official Hindi translations. Excellent for OCR evaluation, legal NER, and semantic search demos.
- Blank/specimen FIR forms and Integrated Investigation Forms published on state police websites.
- Published NCRB reports - useful for realistic statistical distributions (offence mix, disposal rates) when generating synthetic data.
- Model forms in police manuals and prosecution handbooks.

**Layer 2 - Public research corpora (verify each of these before citing):**
- **HLDC** - Hindi Legal Documents Corpus, a large collection of Hindi district-court documents from an Indian academic group.
- **ILDC** - Indian Legal Documents Corpus, used for judgment-prediction research.
- **OpenNyAI** - an Indian open-source legal AI initiative that has released a legal named-entity model with entity types including COURT, PETITIONER, RESPONDENT, JUDGE, LAWYER, STATUTE, PROVISION, PRECEDENT, CASE_NUMBER, WITNESS, and a rhetorical-role labelling model.
- **InLegalBERT / InCaseLawBERT** - transformer models pre-trained on Indian legal text.
- **MuRIL / IndicBERT** - multilingual encoders covering Indian languages.
- **IL-TUR** - an Indian legal NLP benchmark suite.

> ⚠️ **I have no web access and cannot verify these.** Every name, author and dataset above is offered as a search lead. Confirm existence, licence and citation before putting any of them in a slide or a report. Do not cite anything you have not personally opened.

**Layer 3 - Synthetic generation (this is your main source):**

Generate a realistic corpus of 200-500 documents across 20-30 fictional cases:

1. Write templates matching the real IF-1 to IF-5 structures.
2. Use an LLM to populate them with plausible, entirely fictional narratives - varied offence types, varied districts, varied officer names.
3. Generate in **Hindi and English at minimum**, ideally add one more script (Bengali/Tamil/Telugu) to demonstrate multilingual capability.
4. **Print a subset, handwrite a subset, then scan them.** Add skew, coffee stains, fold lines, low-contrast photocopying. This is your realistic OCR test set and it takes one afternoon. Judges notice when a demo works on a genuinely ugly scan.
5. Build a small, deliberately linked network - the same fictional phone number appearing in three unrelated FIRs - so the cross-case link-analysis feature has something to find.
6. Generate a tampered variant of several documents so you can *demonstrate the integrity check failing*, on stage, live.

> **Demo tip that wins rooms:** open a sealed document, edit one character, re-upload it, and let the system reject it in front of the judges with a red banner and a diff of the hash. That thirty-second moment is worth more than ten slides.

### 5.5 Data ethics and governance

- **Purpose limitation.** Every access requires a purpose code; the purpose is stored with the audit event.
- **Data minimisation.** AI extraction pulls only defined fields, not free-form summarisation of victim narratives.
- **Residency.** All storage, all keys, all logs in India, on government-controlled infrastructure. No third-party cloud AI API sees case content - models run on-premise. **Say this. It is a decisive point for MHA.**
- **No training on live data** without explicit governance approval.
- **Rights of the data principal** - access, correction and grievance routes exist even where law-enforcement exemptions apply.

---

## 6. Solution overview

### 6.1 The one-sentence version

> **PRAMANA is a zero-trust, blockchain-anchored document and evidence platform for the criminal justice system: every document is encrypted at rest and sealed with a cryptographic fingerprint the moment it is created, every access is attribute-checked and permanently logged, every custody transfer is signed, and every file can be proved unaltered in court - with an AI layer that makes twenty years of multilingual, handwritten paper instantly searchable.**

### 6.2 Design principles

1. **The chain stores proof, never content.** No case data on-chain, ever. Hashes, custody events and policy references only.
2. **The original is immutable; everything else is a rendition.** Redactions, translations, OCR text and AI annotations are separate derived objects with their own hashes, linked to but never overwriting the sealed original.
3. **Deny by default.** No implicit access, no "admin sees everything," no role that can read a sealed document alone.
4. **Every action is evidence.** The audit log is designed to be produced in court, not just read by an administrator.
5. **AI assists, never decides.** No AI output is evidence. Every AI-derived field is visibly marked as machine-generated, carries a confidence score, and has a human verification state.
6. **Assume the network is down.** The field app must work fully offline and sync later without losing evidentiary quality.
7. **Assume the insider is hostile.** Design as though a legitimate credential is already compromised.
8. **Legal validity over technical elegance.** A digitally elegant solution that produces an inadmissible document is a failure.

### 6.3 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                          │
│  Officer Web Console │ Field Mobile (offline-first) │ Prosecutor  │
│  Court Portal │ Citizen Status Portal │ Public Verifier           │
└────────────────────────────┬─────────────────────────────────────┘
                             │  mTLS · short-lived tokens
┌────────────────────────────▼─────────────────────────────────────┐
│  EDGE / ZERO-TRUST GATEWAY                                        │
│  AuthN (DSC · eSign · FIDO2 · TOTP) · rate limit · WAF · device   │
│  posture · per-request policy evaluation                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│  APPLICATION SERVICES                                             │
│  ┌────────────┬──────────────┬────────────┬───────────────────┐  │
│  │ Document   │ Case &       │ Custody &  │ Policy Engine     │  │
│  │ Service    │ Workflow     │ Evidence   │ (ABAC / Rego)     │  │
│  ├────────────┼──────────────┼────────────┼───────────────────┤  │
│  │ Signature  │ Redaction &  │ Search &   │ Audit Service     │  │
│  │ Service    │ Identity     │ Retrieval  │ (append-only)     │  │
│  │ (PAdES)    │ Vault        │            │                   │  │
│  └────────────┴──────────────┴────────────┴───────────────────┘  │
└──────┬──────────────┬──────────────┬───────────────┬─────────────┘
       │              │              │               │
┌──────▼─────┐ ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────────┐
│ ENCRYPTED  │ │ METADATA    │ │ AI SERVICE │ │ BLOCKCHAIN      │
│ OBJECT     │ │ Postgres    │ │ OCR · NER  │ │ Permissioned    │
│ STORE      │ │ + pgvector  │ │ Embeddings │ │ consortium      │
│ WORM       │ │ + row-level │ │ Redaction  │ │ Anchors ·       │
│ versioned  │ │   security  │ │ Anomaly    │ │ Custody ·       │
│ legal hold │ │ OpenSearch  │ │ (on-prem)  │ │ Access log root │
└────────────┘ └─────────────┘ └────────────┘ └─────────────────┘
       │                                              │
┌──────▼──────────────────────────────┐   ┌───────────▼──────────┐
│ KEY MANAGEMENT - HSM-backed         │   │ TRUSTED TIMESTAMP    │
│ envelope encryption, threshold keys │   │ (CCA-licensed TSA)   │
└─────────────────────────────────────┘   └──────────────────────┘
       │
┌──────▼───────────────────────────────────────────────────────────┐
│  INTEGRATION BUS - ICJS · CCTNS · eCourts · eSakshya · FSL LIMS  │
│  DigiLocker · eSign · SIEM                                        │
└──────────────────────────────────────────────────────────────────┘
```

### 6.4 The lifecycle, end to end

```
CAPTURE ─→ SEAL ─→ CLASSIFY ─→ STORE ─→ USE ─→ TRANSFER ─→ PRODUCE ─→ RETAIN ─→ DISPOSE
   │        │         │           │       │        │           │          │         │
   │        │         │           │       │        │           │          │         └─ scheduled destruction
   │        │         │           │       │        │           │          │            + certificate, unless
   │        │         │           │       │        │           │          │            legal hold
   │        │         │           │       │        │           │          └─ retention class applied
   │        │         │           │       │        │           └─ court bundle + evidence certificate
   │        │         │           │       │        └─ signed custody handoff, both parties
   │        │         │           │       └─ every view/print/share logged + watermarked
   │        │         │           └─ encrypted, WORM, versioned
   │        │         └─ AI: type, language, entities, sensitivity, case linkage
   │        └─ hash + device attestation + DSC signature + TSA timestamp + on-chain anchor
   └─ mobile / scanner / CCTNS pull / partner system
```

**The crucial property:** sealing happens at step 2, before the document has travelled anywhere or been seen by a server administrator. Everything after that point is verifiable against that seal.

---

## 7. How each failure gets solved

| Failure (§2.2) | Mechanism | Demonstrable in demo? |
|---|---|---|
| Cannot find things | Hybrid semantic + keyword search over OCR'd multilingual text; entity search; cross-case graph | ✅ Yes - headline feature |
| Wrong people see it | ABAC policy engine: rank × jurisdiction × case assignment × sensitivity × purpose; deny-by-default | ✅ Yes - show a denial |
| Tampering | Hash at capture, anchored on permissioned chain, verifiable by anyone | ✅ Yes - **do the tamper demo** |
| No version control | Immutable originals + explicit version chain, each version separately anchored, visual diff | ✅ Yes |
| No collaboration | ICJS-shaped sealed exchange, signed custody handoffs, external portals with scoped access | ⚠️ Mock the partner systems |
| Delay | Statutory deadline engine, auto-generated bundles, one-click disclosure packs | ✅ Yes - deadline dashboard |
| No accountability | Append-only audit log, Merkle-batched and anchored, UEBA anomaly detection | ✅ Yes - trigger an alert live |

---

## 8. Detailed feature set

### Module 1 - Identity, Access and Trust

- **Multi-factor authentication** - Class 3 DSC token (what officers already carry), Aadhaar-based eSign, FIDO2 hardware key, or TOTP. Support the government 2FA stack where present.
- **Attribute-based access control (ABAC), not just roles.** Access is evaluated on a policy expression combining: rank, unit, district/jurisdiction, explicit case assignment, document sensitivity level, purpose code, time of day, device trust level, and network location. Policies are written declaratively (Rego/Cedar) rather than hard-coded, so a legal change becomes a policy edit, not a release.
- **Policy versioning with on-chain anchoring.** The hash of the active policy set is anchored. This lets you prove, years later, *what the access rules actually were* on the day of an access - closing an argument the defence would otherwise open.
- **Purpose-bound access.** You do not simply open a document; you open it *for a reason*, selected from a controlled vocabulary. The reason is stored, is visible to supervisors, and is anomaly-scored.
- **Break-glass access.** Emergency override exists, because it must. But it requires a written justification, is time-boxed to a short window, triggers an immediate immutable notification to two supervisors, and appears permanently flagged in the case audit view. Emergency access should be possible and uncomfortable.
- **Delegation and handover.** When an officer is transferred, case access transfers as an explicit, dual-signed event rather than by informally sharing a password. The handover generates a manifest of exactly what the file contained at that moment, hashed and signed by both officers - which alone solves the "two loose sheets went missing" problem from §2.1.
- **Session security.** Short-lived tokens, mutual TLS, device binding, automatic session termination on anomaly, concurrent-session limits.

### Module 2 - Capture and Ingestion

- **Mobile field capture (the offline-first app).** Photograph, video, audio, or typed statement. On the device, before any transmission: compute the hash, capture device attestation, GPS coordinates, timestamp from a trusted source, and the officer's signature. Queue for sync. When connectivity returns, upload and anchor. If the officer is offline for three days in a forest, the evidentiary quality of what he captured on day one is unaffected - the seal was made at capture, and the anchor timestamp records both capture time and anchor time separately and honestly.
- **Content provenance.** Attach provenance metadata to captured media in line with emerging content-authenticity standards, so downstream systems can verify origin independently.
- **Bulk scanning pipeline** for backfile digitisation - watch-folder ingestion, automatic deskew and denoise, blank-page removal, separator-sheet-based document splitting, OCR, auto-classification, auto-linking to a case, and a human verification queue for anything below a confidence threshold.
- **Structured pull from CCTNS/ICJS** - FIR and investigation form data arrive as structured records, not scans.
- **Secure intake portal** for external parties: hospitals filing medical reports, FSLs filing forensic reports, banks responding to notices. Replaces email attachments entirely.
- **Duplicate detection** - exact hash match, and perceptual hashing for images and video so a re-scanned or re-encoded copy is recognised as the same artefact rather than silently multiplying.

### Module 3 - Document Core

- **Immutable originals.** Once sealed, the original object is never modified. Storage is write-once-read-many with object versioning and object-lock retention.
- **Explicit version chains.** Drafting a charge sheet creates versions v1…vN, each individually hashed and anchored, each attributed to an author, each carrying a mandatory change note. Visual diff between any two versions. The `chargesheet_FINAL_use_this.docx` problem simply cannot occur.
- **Renditions.** Every derived artefact - redacted copy, OCR text layer, translated version, thumbnail, court-format PDF/A - is a first-class object linked to the original, with its own hash and its own access rules. A prosecutor may be entitled to the redacted rendition and not the original; the model supports that natively.
- **Archival formats.** Conversion to PDF/A for long-term preservation. Signatures applied in a long-term-validation profile so they remain verifiable decades later even after the signing certificate expires - an unglamorous detail that experienced evaluators will recognise immediately.
- **Retention and disposal.** Every document inherits a retention class from its type and its case outcome. The system proposes disposal on schedule, requires human approval, executes cryptographic erasure, and issues a signed certificate of destruction - while the on-chain anchor survives, so it remains provable that the document existed and was lawfully destroyed rather than quietly lost.
- **Legal hold.** A court order or pending appeal freezes disposal for a defined scope, overriding the retention schedule, logged as an explicit event.

### Module 4 - Case Workspace

- **The case as the organising unit,** not the folder. Every document, entity, deadline, custody event and task hangs off a case.
- **Auto-assembled chronology.** Dates extracted from documents build a case timeline automatically; the officer corrects rather than constructs it.
- **Entity panel.** Every person, vehicle, phone, account and location mentioned across the file, deduplicated, each linking back to the documents that mention them.
- **Completeness checker.** Given the sections invoked, the system knows which documents the file must eventually contain, and shows what is missing. For a case under specific offence sections it will flag a missing medical report or a missing forensic report before the prosecutor discovers it in court.
- **Statutory deadline engine.** The heart of the compliance value. The system computes every applicable statutory deadline from the new procedure code - investigation completion windows, progress-intimation obligations, document supply timelines, forwarding requirements - and drives a countdown dashboard with tiered escalation to supervisory ranks.
- **Court bundle generator.** One click produces a properly paginated, indexed, bookmarked, hyperlinked electronic brief in court-acceptable format, with an integrity manifest and evidence certificates attached. This alone removes days of clerical work per case.

### Module 5 - Chain of Custody and Evidentiary Integrity

*This is the module that wins the "Blockchain & Cybersecurity" theme. Give it the most demo time.*

- **Custody ledger.** Every transfer of a document or physical exhibit is a signed event: who released, who received, when, where, why, and the hash of the item at the moment of transfer. Both parties sign. Gaps are impossible because the ledger is append-only and each transfer references the previous custodian.
- **Physical exhibit extension.** The same ledger tracks physical evidence - a seized weapon, a sealed sample, a phone - with QR/RFID tags, malkhana location, and seal integrity status. **This is where you satisfy the "asset lifecycle" line in the problem statement.**
- **Automatic evidence certificate generation.** At the moment a document is produced for court, the system generates the statutorily-prescribed certificate for electronic evidence, pre-filled with the hash, the algorithm, the device details, the capture circumstances, and the custody history - routed for the required dual signature. **Demo this. It is the highest-value thirty seconds in your presentation.**
- **Public verification tool.** A page where anyone - defence counsel, a journalist, a judge's clerk - drops a file and learns whether its fingerprint matches an anchored record, and when that record was anchored. It reveals nothing about content. It converts integrity from a claim into something the other side can check themselves, which is precisely what makes it persuasive.
- **Trusted timestamping.** Pair the on-chain anchor with a timestamp from a licensed timestamping authority, because a statutorily-recognised timestamp and a distributed-ledger record answer slightly different objections. Belt and braces, and cheap.
- **Tamper alarm.** Any integrity check failure - during a routine sweep or an on-access verification - immediately locks the object, alerts the CISO and the case supervisor, and opens an incident record.

### Module 6 - Digital Signature and Approval

- **Signing with what officers already have** - Class 3 DSC tokens; Aadhaar-eSign as an alternative where tokens are impractical.
- **Multi-party signing workflows** - sequential and parallel, with countersignature, delegation and rejection-with-reason. A charge sheet routes IO → SHO → DSP → Prosecutor with each signature bound to a specific document version.
- **Signature binding to version.** Approving version 7 does not silently approve version 8. Any change after signature invalidates the signature and is displayed as such.
- **Long-term validation.** Signatures are preserved with the evidence needed to validate them after certificate expiry.

### Module 7 - Search and Intelligence

- **Hybrid search** - keyword (BM25) plus dense semantic vectors, fused. Keyword catches names and case numbers; semantic catches "the witness who saw a red vehicle near the school" when the document says "maroon Maruti near the primary vidyalaya."
- **True multilingual retrieval.** Query in English, retrieve documents written in Hindi. This is not a nice-to-have in Indian policing; it is the difference between the search working and not working.
- **Search inside scans and handwriting.** OCR including handwritten Devanagari and other Indic scripts, with the recognised text stored as a searchable layer over the immutable original.
- **Access-aware results.** The search index respects the policy engine. A document you may not see does not appear - and, importantly, does not appear as a "restricted result" either, because the existence of a sealed document can itself be sensitive.
- **Cross-case link analysis.** Entity resolution across cases surfaces the same phone number, account, vehicle or address appearing in otherwise unconnected FIRs, rendered as a graph. For NCRB specifically this is a high-value capability, because national pattern detection is their mandate.
- **Case assistant (retrieval-augmented).** Ask "what did the third witness say about the timeline?" and get an answer with inline citations to the exact document and page. **Hard constraints:** every claim carries a citation, the model runs on-premise, it never generates legal conclusions, and it refuses rather than guesses. Frame it as *a research assistant for a 4,000-page file*, never as a decision-maker.

### Module 8 - Redaction and Identity Protection

- **Automatic PII detection** - identification numbers, phone numbers, addresses, bank accounts, names - proposed for redaction with human confirmation.
- **True redaction.** Redacted content is removed from the rendition, not covered with a black rectangle over recoverable text. This is a real and recurring failure in government document release and calling it out shows you know the domain.
- **Redaction as a rendition.** The redacted copy is a new object with its own hash and its own access policy. The original stays sealed and untouched.
- **Media redaction** - face blurring in images and video, voice alteration in audio, for witness and victim protection.
- **Dynamic watermarking.** Every on-screen view and every download is watermarked with the viewing officer's identity, timestamp and case number. If a photographed screen appears on social media, the leak is attributable to an individual. **Deterrence is the feature; attribution is the mechanism.**

### Module 9 - Collaboration and External Exchange

- **Scoped sharing** - share a defined set of documents with a defined party for a defined period for a defined purpose. Access expires automatically. Revocation is immediate.
- **Prosecutor workspace** - a persistent view of assigned cases with the ability to formally request missing material through the system, creating a tracked obligation rather than a phone call.
- **Court exchange** - sealed electronic bundles transmitted with integrity manifests, and sealed-cover material handled under threshold decryption so that transmission does not mean disclosure.
- **Inter-agency transfer** - a case moving from local police to a central agency transfers as a signed custody event with a complete manifest, not as a photocopied bundle.
- **Task and comment threads** bound to documents, with comments as separate annotations that never modify the sealed original.

### Module 10 - Audit, Monitoring and Anomaly Detection

- **Append-only audit log** capturing every read, write, print, download, share, export, permission change, failed authorisation, and search query. Yes, search queries - searching for a case you have no connection to is itself a signal.
- **Merkle batching and anchoring.** Writing one blockchain transaction per audit event does not scale. Instead, build a Merkle tree of all events in each time window and anchor only the root. Each individual event then carries an inclusion proof, so any single log line can be proved authentic and un-backdated without the chain carrying millions of transactions. **This is the design detail that separates teams who understand blockchain from teams who have heard of it. Make sure at least one member can explain it clearly at the table.**
- **Behavioural anomaly detection.** Baseline each user, then flag: bulk downloads, off-hours access, access to cases outside assignment or jurisdiction, sudden interest in a case about to be filed, repeated denied attempts, unusual export volume, or access immediately preceding a transfer. Route to the supervisor, not to a log nobody reads.
- **Compliance dashboards** - statutory deadline adherence, disclosure obligations met, retention schedule status, access review completion, integrity sweep results, by station and by district.
- **CERT-In alignment** - 180-day in-country log retention, synchronised clocks, defined incident reporting workflow.
- **SIEM export** for the department's existing security operations.

### Module 11 - Administration and Operations

- Organisational hierarchy modelling (state → range → district → station), automatic jurisdiction derivation.
- Key lifecycle: generation in HSM, rotation, escrow for sealed material, revocation.
- Access recertification: periodic supervisor confirmation that each person still needs the access they hold.
- Backup, disaster recovery across two data centres, immutable snapshots for ransomware resilience.
- Health, performance and integrity-sweep monitoring.

### Module 12 - Citizen-Facing Layer

- **Case status portal** - the complainant checks progress using a reference number and OTP, without visiting the station.
- **Automated statutory progress intimation** at the ninety-day mark, delivered by SMS, email and DigiLocker, with a delivery receipt recorded as proof that the obligation was discharged.
- **Document delivery** - FIR copies and other legally-mandated disclosures pushed to the citizen's DigiLocker.
- **Grievance channel** with a tracked, time-bound response.

---

## 9. The Women Safety Division module

*Build this. It is the reason your problem statement carries this department's name, and almost no competing team will address it.*

### 9.1 Sensitive Case Mode

When a case is registered under offence sections relating to sexual violence, offences against children, trafficking, or domestic violence, the system **automatically** escalates the entire case to sensitivity level 3 or 4. No officer has to remember to do it. Escalation is automatic, de-escalation requires senior approval and a recorded reason.

In Sensitive Case Mode:

- The case does not appear in station-wide listings.
- Access requires explicit assignment; rank alone is insufficient. A District Superintendent who is not assigned does not get access by seniority - he gets a request button.
- Every view is watermarked, no exceptions.
- Bulk export and print are disabled by default.
- The audit trail is reviewed on a fixed cycle, not on complaint.

### 9.2 The Victim Identity Vault

The design decision that makes this module real:

> **The victim's identifying particulars are never stored in the working documents. They live in a separately encrypted vault. Every document, index entry, search result, notification and export refers to the victim by a stable pseudonym.**

De-anonymisation is a distinct, privileged operation requiring dual authorisation, a recorded justification, and an immediate immutable notification to the supervising officer. It is logged as a first-class event, separate from ordinary document access.

Why this matters: disclosure of a protected victim's identity is a criminal offence, and courts have issued specific directions on identity protection and sealed handling. Today, compliance depends on individual officers remembering to be careful with a name that is written in plain text across forty documents. Here, compliance is structural. **An officer cannot leak what the system never showed him.**

The same architecture protects protected witnesses and informant/source identities.

### 9.3 Statutory role enforcement

Where the law requires a particular officer to perform a particular act - for instance, statements of women and child victims being recorded by a woman officer - the system enforces it at the point of upload. Only an account with the required attribute can create or attest that document class. Attempts by others are blocked with an explanatory message, and blocked attempts are logged.

This converts a legal requirement from an audit finding after the fact into a control at the moment of action.

### 9.4 Statutory timeline monitoring

Sexual offence investigations carry a compressed statutory deadline. The module runs a live countdown per case, with:

- Escalation to the SHO at 60% of the window, to the DSP at 80%, to the SP at 90%.
- Reason-for-delay capture that becomes part of the permanent case record.
- A district and state heat map for the Women Safety Division's own oversight.

Separate trackers handle medical-report forwarding windows, progress-intimation obligations, and document-supply deadlines.

### 9.5 Sealed cover handling

For material a court orders into sealed cover, or for source-protection material:

- Encrypted under a threshold scheme so that **no single individual - including the system administrator - can decrypt it**.
- Unsealing requires m-of-n approvals from designated custodians (for example, the case judge, the supervising officer, and the prosecution head).
- An enforced waiting period between request and unsealing, with automatic notification to all custodians during the wait, so an illegitimate request is visible before it succeeds.
- Every unsealing is anchored on-chain.

This is exactly the guardian-and-waiting-period pattern from your Rebind work, transplanted: threshold custody, identity-bound recovery, human approval in the loop, and an attacker who cannot win by stealing one credential. You have built this shape before - reuse the mental model and, where you can, the code.

### 9.6 Support-service linkage

Where a case involves an identified victim, the system surfaces (to authorised users only) the applicable victim compensation scheme status, support-person appointment status, and referral records - because these are also statutory obligations that currently get missed.

---

## 10. Blockchain design - the specifics

### 10.1 Why permissioned, not public

Anticipate the question and answer it before it is asked:

| Requirement | Public chain | Permissioned consortium chain |
|---|---|---|
| Data sovereignty (must remain in India, on government infrastructure) | ✗ | ✓ |
| Known, accountable validators | ✗ | ✓ |
| Predictable cost with no cryptocurrency exposure | ✗ | ✓ |
| Throughput for national scale | ✗ | ✓ |
| Confidentiality of even metadata | ✗ | ✓ |
| Decentralisation across mutually independent institutions | ✓ | ✓ (sufficient) |

**The consortium is the argument.** Independent nodes operated by NCRB, State CID/Police, the judiciary, forensic laboratories and the prosecution directorate. These bodies do not report to one another. That is precisely why the ledger is credible: no single institution can rewrite history, and the entities with an incentive to alter a record are checked by entities with an incentive to catch them.

Suggested platform: an enterprise Ethereum-compatible permissioned network with a Byzantine-fault-tolerant consensus and immediate finality - which lets you write contracts in Solidity, use tooling you already know, and still satisfy the governance requirements. Hyperledger Fabric is the alternative if you prefer channel-based data isolation; either is defensible, but pick the one your team can actually ship in the time available.

### 10.2 What goes on-chain - and what absolutely does not

**On-chain:**
- Document hash, algorithm identifier, document type code, sensitivity level
- Version number and pointer to the previous version's anchor
- Custody event: actor identifier (pseudonymous), action code, timestamp, previous-custodian reference
- Merkle root of each audit-log batch
- Hash of the active access-policy set
- Signature references and revocation events
- Legal-hold and disposal events

**Never on-chain:**
- Document content, in any form
- Names, addresses, identification numbers, any personal data
- Case narratives
- Anything from which the content could be inferred

Even actor identifiers should be pseudonymous on-chain, with the mapping held off-chain under access control - otherwise the ledger itself becomes a surveillance record of which officer touched which case.

### 10.3 Contract set

| Contract | Responsibility |
|---|---|
| `DocumentRegistry` | Anchors document hashes; maintains version chains; emits anchor events |
| `CustodyLedger` | Records signed custody transfers for documents and physical exhibits |
| `AuditAnchor` | Accepts periodic Merkle roots of audit batches |
| `AccessPolicyRegistry` | Anchors the hash of each policy version with its effective period |
| `SealedCustody` | Threshold-unseal requests, guardian approvals, waiting-period enforcement |
| `RetentionRegistry` | Legal holds, disposal authorisations, destruction certificates |

Keep them small, keep them auditable, and write tests. A judge with a blockchain background will ask to see the contract, and a 60-line well-tested contract impresses far more than a 600-line unaudited one.

### 10.4 Scaling honestly

Rough order of magnitude: sixteen thousand police stations, tens of thousands of documents created daily, and audit events an order of magnitude beyond that. Per-event transactions are not viable.

**The design that works:**
- Anchor document hashes individually - this volume is manageable and each document deserves its own on-chain identity.
- Batch audit events into Merkle trees, anchoring one root per station per time window. Millions of events collapse into a handful of transactions, and every event still gets an individually verifiable inclusion proof.
- Keep custody events individual, since they are relatively rare and evidentiarily critical.

Be ready with numbers: transactions per second required, per second achievable, and storage growth per year. Judges reward candour about scale far more than they reward optimistic hand-waving.

---

## 11. AI design - and its guardrails

### 11.1 The pipeline

```
Document ─→ Preprocess (deskew, denoise, orientation)
         ─→ Language & script detection
         ─→ OCR / handwriting recognition (Indic scripts)
         ─→ Layout & structure analysis
         ─→ Document type classification
         ─→ Legal & general entity extraction
         ─→ Sensitivity scoring → auto-classification
         ─→ Embedding generation → vector index
         ─→ Date extraction → case chronology
         ─→ Entity resolution → cross-case graph
         ─→ PII detection → redaction proposals
```

Everything produced here is written to a **derived-metadata namespace**, versioned independently, and marked as machine-generated. It never touches the sealed original.

### 11.2 Model choices

- **OCR:** an open, self-hostable engine with Indic script support, with a handwriting-specific model for case diaries and statements. Realistically, handwritten Devanagari recognition will be your weakest link - plan for a human-verification queue rather than pretending accuracy is solved.
- **Language:** an Indian-language multilingual encoder for embeddings; a legal-domain encoder for entity extraction if you can obtain one; national language-technology infrastructure for translation.
- **Retrieval:** dense embeddings in a vector store alongside a lexical index, with reciprocal-rank fusion.
- **Generation:** a self-hosted instruction model for the case assistant, constrained to retrieval-grounded answering with mandatory citations.
- **Anomaly detection:** sequence and frequency models over audit events, with a rules layer for known-bad patterns.

**Every model runs on-premise.** No case content leaves government infrastructure. Say this unprompted.

### 11.3 Guardrails - state these explicitly in your pitch

1. **AI output is never evidence.** It is an index, a search aid, and a proposal for human action.
2. **Every AI field is visibly marked** as machine-generated with a confidence score and a human-verification state.
3. **Redaction proposals require human confirmation** before a redacted rendition is issued.
4. **No sensitivity de-escalation by AI.** The model may raise a document's sensitivity classification automatically; only a human may lower it. Errors should fail towards protection.
5. **The assistant cites or declines.** No answer without a document reference.
6. **No predictive policing, no risk scoring of individuals, no bail or guilt prediction.** Not because it is technically hard, but because it is the wrong thing to build. Saying this deliberately - and explaining that you considered and rejected it - reads as maturity, not as a gap.

---

## 12. Security architecture and threat model

### 12.1 Cryptography

- **Envelope encryption:** each document has its own data key (AES-256-GCM); data keys are wrapped by a case key; case keys are wrapped by an organisational master key held in an HSM. Compromise of one document key exposes one document.
- **Client-side encryption** for the highest sensitivity classes, so plaintext never exists on a server.
- **Threshold cryptography** for sealed material - no single-party decryption.
- **Hashing:** SHA-256 as the primary anchor, with the algorithm identifier recorded alongside every hash so that migration to a stronger algorithm is possible without invalidating history. Re-anchoring under a new algorithm is a planned operation, not a crisis.
- **Signatures:** DSC-based, with long-term validation preservation.

### 12.2 Threat model

| Threat | Vector | Mitigation |
|---|---|---|
| **Malicious insider - leak** | Authorised officer copies a sensitive file to media | Least-privilege ABAC, identity vault (they never see the name), dynamic watermarking for attribution, export controls, UEBA alerting |
| **Malicious insider - tampering** | Officer alters a document to fit a theory | Immutable originals, on-chain anchor, alteration detected on the next verification and provable in court |
| **Coerced deletion** | Senior pressure to make a document vanish | Anchor persists; the document's prior existence is provable even if the object is removed |
| **Database administrator** | Privileged operator edits records directly | Encrypted at rest with keys the DBA does not hold; audit anchors on an independent ledger |
| **Credential theft** | Phishing, stolen token | Hardware MFA, device binding, geo/behaviour anomaly detection, short sessions |
| **Ransomware** | Encryption of the primary store | WORM object lock, immutable snapshots, offsite replication; anchors prove what existed regardless of what the attacker did to the storage |
| **Network interception** | MITM on a state network | mTLS everywhere, client-side encryption for sensitive classes, certificate pinning on mobile |
| **Lost/stolen field device** | Officer's phone taken | Device encryption, remote wipe, no plaintext at rest on device, biometric unlock, queued items encrypted to a server key the device cannot read back |
| **Supply chain** | Compromised dependency | SBOM, dependency pinning, signed builds, reproducible builds where feasible |
| **Model poisoning** | Adversarial input degrading AI | AI outputs are non-authoritative by design, so the blast radius is search quality, not evidence |
| **Denial of service** | Availability attack during a critical filing window | Rate limiting, WAF, offline-capable clients, degraded read-only mode |
| **Sealed-cover compromise** | Attempt to unseal without authority | Threshold decryption, waiting period, all-custodian notification, on-chain record of every attempt |

### 12.3 Zero-trust posture

No implicit trust from network location. Every request authenticated, authorised against current policy, and logged. Service-to-service traffic uses mutual TLS with short-lived certificates. Assume the perimeter is already breached and design accordingly - because in a system spanning sixteen thousand stations, it eventually will be.

---

## 13. Legal and compliance mapping

Put a version of this table in your submission. It is the fastest way to show that this is a domain solution rather than a generic file manager.

| Obligation | Source | PRAMANA feature |
|---|---|---|
| Electronic record certificate with hash | Evidence law (BSA) | Auto-generated certificate with hash, algorithm, device and custody history |
| Dual signature on the certificate | Evidence law (BSA) | Dual-signature workflow, DSC-bound |
| Search & seizure audio-video recording | Procedure code (BNSS) | Video ingestion, hashing, sealed transmission to Magistrate |
| Forensic team videography for grave offences | Procedure code (BNSS) | Forensic media custody chain |
| 90-day progress intimation to informant | Procedure code (BNSS) | Automated notification with delivery receipt |
| 14-day supply of copies | Procedure code (BNSS) | One-click redacted disclosure pack |
| Time-bound investigation in sexual offence cases | Procedure code (BNSS) | Statutory countdown with tiered escalation |
| Victim identity non-disclosure | Penal code + POCSO + Supreme Court directions | Victim Identity Vault, pseudonymisation by default |
| Woman officer to record specified statements | Procedure code + POCSO | Attribute-enforced upload control |
| Digital signature legal recognition | IT Act | CCA-licensed DSC and eSign integration |
| 180-day in-country log retention, clock sync, incident reporting | CERT-In directions | Audit log design, NTP sync, incident workflow |
| Purpose limitation, security safeguards, breach handling | DPDP Act | Purpose codes, encryption, breach playbook |
| Records retention and disposal | Public Records Act + police manuals | Retention classes, disposal with certificate, legal hold |
| Interoperability across justice pillars | ICJS mandate | ICJS-shaped integration bus |

---

## 14. Technology stack

Chosen for what your team can actually ship, not for what sounds impressive.

| Layer | Choice | Why |
|---|---|---|
| **Web client** | React + TypeScript + Tailwind, PWA | Fast to build, offline-capable |
| **Mobile** | React Native (or Flutter) | One codebase, native crypto and camera access |
| **Core API** | **Rust (Axum)** | The custody, hashing, encryption and anchoring path is security-critical; memory safety here is a real argument, not a preference - and it plays to your strengths |
| **AI service** | Python (FastAPI) | Where the model ecosystem lives; kept as a separate, network-isolated service |
| **Database** | PostgreSQL + row-level security + pgvector | Relational integrity, native vectors, RLS as defence in depth |
| **Search** | OpenSearch / Meilisearch | Lexical half of hybrid search |
| **Object store** | MinIO with object lock (WORM) + versioning | S3-compatible, self-hostable on government infrastructure |
| **Blockchain** | Permissioned EVM network (QBFT/IBFT), Solidity contracts, Hardhat or Foundry | Solidity is a skill you already have; permissioned satisfies sovereignty |
| **Policy engine** | OPA / Rego | Declarative, auditable, versionable ABAC |
| **Secrets & keys** | HashiCorp Vault in the demo; HSM in production | Honest about the demo/production gap |
| **Graph** | Neo4j (optional) | Cross-case link analysis |
| **Observability** | OpenTelemetry, Grafana, Loki | Standard, and needed for the anomaly demo |
| **Deployment** | Docker Compose for demo; Kubernetes on NIC Cloud/MeghRaj for production | Realistic government hosting path |

**Say the production hosting story out loud:** MeitY-empanelled government cloud, all data resident in India, all models on-premise, no third-party API sees case content. For MHA this is not a detail - it is a precondition.

---

## 15. Non-functional targets

Have numbers ready. Vague answers here lose points.

| Property | Target |
|---|---|
| Search latency | < 500 ms p95 over 10 million documents |
| Upload + seal + anchor | < 3 s for a 10 MB document (anchor may be asynchronous, and you should say so) |
| Integrity verification | < 200 ms |
| Availability | 99.9% core, with offline-capable clients absorbing outages |
| Max object size | 5 GB (body-cam and CCTV video) with chunked, resumable upload |
| Audit log write | Fully asynchronous, never blocking the user action, never lossy |
| Recovery point objective | 15 minutes |
| Recovery time objective | 4 hours |
| Concurrent users | 50,000 (national scale) |
| Offline field operation | 7 days of queued capture without connectivity |
| Accessibility | Government accessibility guidelines; Hindi and English UI minimum, with a path to more languages |

---

## 16. Hackathon build plan

### 16.1 What to actually build

Ruthless scoping. You are showing a system, not shipping one.

**Must build - this is the demo (the P0 spine):**
1. Auth with role/attribute assignment (mock the DSC - a simulated token is fine, say it is simulated).
2. Upload → hash → encrypt → store → anchor on a local permissioned chain.
3. Case workspace with a document list, versions, and a timeline.
4. **The tamper demo** - verify pass, alter, verify fail, with a clear red UI state.
5. **Evidence certificate generation** - a real, downloadable PDF with a real hash.
6. ABAC access denial - one user can see a case, another is blocked, with a logged denial.
7. Audit trail view with Merkle-batched anchoring, showing an inclusion proof for one event.
8. Search: hybrid, working over OCR'd Hindi and English documents.
9. Public verifier page - drag a file, get a verdict.

**Should build - strong differentiators if time allows:**
10. Women Safety Mode with the Victim Identity Vault and a live pseudonymisation demo.
11. Statutory deadline dashboard with a countdown and one escalation.
12. Auto-redaction with a before/after view.
13. Anomaly alert triggered live during the demo.

**Mock convincingly, do not build:**
- CCTNS/ICJS integration (build the adapter interface and a fake source that returns realistic payloads - the interface is what proves you understand the integration).
- HSM (use Vault, and say clearly that production uses an HSM).
- eSign/DigiLocker (mock the API shape).
- Multi-institution consortium (run three or four nodes locally, in separate containers, and show them agreeing - this is surprisingly persuasive on a laptop).

**Explicitly do not build:** a full offline mobile app, cross-case graph analysis at scale, handwriting OCR trained from scratch, or a general-purpose workflow engine. Describe them; do not attempt them.

### 16.2 Suggested six-way split

| Role | Owns |
|---|---|
| **Blockchain** | Contracts, local network, anchoring service, Merkle batching, verifier |
| **Backend / crypto** | Rust core: encryption, hashing, custody, signature, storage, policy integration |
| **AI/ML** | OCR pipeline, embeddings, hybrid search, redaction, anomaly detection |
| **Frontend** | Officer console, case workspace, audit views, verifier page |
| **Data & domain** | Synthetic corpus, legal mapping research, deadline rules, evidence certificate format |
| **Pitch & integration** | Demo script, slides, docker-compose glue, rehearsal, judge Q&A prep |

The data-and-domain role is the one teams forget and the one that most determines whether the demo feels real. Assign it on day one.

### 16.3 Demo script (target: 5 minutes)

1. **(30 s) The hook - the failure.** "In 2019 a photograph was doubted in court because nobody could prove it hadn't been altered. Here's how that ends."
2. **(45 s) Capture and seal.** Upload a scene photograph. Watch the hash compute, the anchor confirm, the ledger entry appear.
3. **(45 s) The tamper demo.** Alter one pixel. Re-upload. Red banner. Hash mismatch shown side by side. **This is your moment - do not rush it.**
4. **(30 s) The evidence certificate.** One click. A real PDF with the hash, the device, the custody history, ready for court.
5. **(45 s) Access control.** Switch to an unassigned officer. Denied. Show the denial in the audit log. Switch to Women Safety Mode - the victim's name is a pseudonym everywhere.
6. **(45 s) Search.** Query in English, retrieve a handwritten Hindi statement, jump to the highlighted line.
7. **(30 s) Audit and anomaly.** Bulk-download as a suspicious user. Watch the alert fire.
8. **(30 s) The verifier.** Hand the laptop to a judge. Let *them* drop the file in and see it verify. **Nothing beats a judge verifying your claim with their own hands.**
9. **(20 s) Close.** The legal mapping table on one slide. "Every one of these is a statutory obligation. Every one is a feature."

Rehearse it eight times. Record a backup video. Assume the wifi will fail - run everything locally.

---

## 17. Roadmap beyond the hackathon

| Phase | Scope |
|---|---|
| **Pilot (0-6 months)** | One district, one crime category. Real CCTNS integration. Security audit and STQC-style certification. |
| **State rollout (6-18 months)** | Full state police, prosecution and FSL. Backfile digitisation programme. Court integration pilot. |
| **National (18-36 months)** | ICJS-wide deployment. Multi-institution consortium chain live. Cross-state case linkage. |
| **Extensions** | Physical evidence/malkhana lifecycle, body-worn camera ingestion, courtroom presentation mode, cross-border mutual legal assistance exchange |

---

## 18. Impact

| Metric | Baseline (indicative - replace with cited figures) | Target |
|---|---|---|
| Time to locate a document | Hours to days | Under 10 seconds |
| Charge sheet preparation time | Weeks | Days |
| Adjournments due to records | Significant share of delays | Substantially reduced |
| Evidence authenticity challenges | Routine | Answerable in seconds with proof |
| Unauthorised access detection | Effectively zero | Real-time |
| Statutory deadline compliance | Not measured | Measured, and enforced by design |
| Victim identity exposure risk | Depends on individual care | Structurally eliminated |
| Storage and physical record cost | High and growing | Materially reduced |

Do not invent precise numbers. Say "indicative" and cite whatever you can verify. Judges notice fabricated statistics far more often than teams expect.

---

## 19. Risks and honest mitigations

| Risk | Mitigation |
|---|---|
| **Officers will not adopt it** | The biggest real risk. Mitigate with an interface that is faster than paper for the officer's most common action, offline capability, vernacular UI, and no double data entry. If it is slower than the register, it fails regardless of its cryptography. |
| **Handwritten Indic OCR accuracy** | Set expectations honestly, keep a human verification queue, and improve iteratively. Do not claim solved accuracy. |
| **Connectivity in rural stations** | Offline-first architecture is a design requirement, not a feature. |
| **Blockchain seen as buzzword** | Pre-empt it: explain precisely what it does that a database cannot (independent, multi-institution, non-repudiable ordering), and be equally clear about what it does not do. Judges respect a team that says "we use it for exactly this and nothing else." |
| **Key loss** | Threshold escrow and documented recovery ceremony. |
| **Legal admissibility challenged** | Certificate generation aligned to the statutory format; trusted timestamping alongside chain anchoring; expert-signable workflow. |
| **Scope creep during the hackathon** | Section 16.1 exists precisely to prevent this. Freeze scope at hour six. |

---

## 20. Why this wins

1. **You read the department, not just the problem.** The Women Safety module is a direct answer to the sponsoring division, and most teams will build a generic DMS.
2. **You use the new criminal law as a feature spec.** The statutory hash certificate is not something you invented - it is something the law now demands and nobody has automated.
3. **Your blockchain use is defensible.** Anchors, not storage. Merkle batching, not one transaction per event. A consortium with a real trust argument. You can explain why a database is insufficient in one sentence.
4. **You designed against the insider,** which is the actual threat in this domain and the one most teams ignore entirely.
5. **You can prove it live.** The tamper demo and the hand-the-laptop-over verifier are visceral in a way that no architecture diagram is.
6. **You are honest about limits.** On-premise models, human-in-the-loop AI, no predictive policing, no fabricated accuracy claims. In a government-sponsored track, restraint reads as competence.

---

## 21. Glossary

| Term | Meaning |
|---|---|
| **ABAC** | Attribute-Based Access Control - permissions computed from attributes, not fixed roles |
| **Anchor** | Writing a hash to the blockchain as timestamped proof of existence |
| **BNS / BNSS / BSA** | India's 2023 penal code, procedure code and evidence law, effective July 2024 |
| **CCTNS** | Crime and Criminal Tracking Network & Systems - NCRB's national police IT backbone |
| **Chain of custody** | The unbroken, documented record of who held evidence, when, and why |
| **DSC** | Digital Signature Certificate - the hardware-token signature officers already use |
| **Envelope encryption** | Encrypting data with a per-object key, then encrypting that key with a master key |
| **HSM** | Hardware Security Module - tamper-resistant hardware for key storage |
| **ICJS** | Inter-operable Criminal Justice System - the bus connecting police, courts, prosecution, prisons, forensics |
| **Merkle tree** | A hash tree letting you prove one item belongs to a large set with a small proof |
| **PAdES-LTV** | A PDF signature profile that stays verifiable after the certificate expires |
| **Rendition** | A derived version (redacted, translated, converted) linked to but distinct from the sealed original |
| **Threshold encryption** | Requiring m-of-n parties to cooperate before decryption is possible |
| **UEBA** | User and Entity Behaviour Analytics - anomaly detection over access patterns |
| **WORM** | Write-Once-Read-Many storage - cannot be overwritten within its retention period |

---

## 22. Verification checklist before submission

I have no web access and cannot verify anything below. **Check every one of these yourself.**

- [ ] All BNSS/BSA/BNS section numbers, against indiacode.nic.in
- [ ] The exact prescribed format of the electronic evidence certificate, including its hash field
- [ ] The *Nipun Saxena* citation and the specific directions it issued
- [ ] Current CCTNS police-station coverage figures
- [ ] Whether eSakshya's current scope overlaps with anything you claim to build
- [ ] Existence, licence and correct citation for every dataset and model named in §5.4
- [ ] CERT-In direction details (retention period, reporting window)
- [ ] Court pendency and adjournment statistics before quoting any of them
- [ ] Current SIH submission format, page limits and slide template
- [ ] Whether any teammate can explain Merkle batching unprompted - if not, fix that before the pitch, because it is the question you are most likely to be asked

---

*Prepared as a working reference. Everything factual here should be independently verified before it appears in a submission or a slide.*
