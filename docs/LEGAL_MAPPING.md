# Legal and compliance mapping

> ## ⚠ Verification status: NOT VERIFIED
>
> Every section number below was written from the problem brief and general knowledge, **not** from the
> bare Act. They are research leads. Before any of this reaches a slide, a report or a judge, confirm
> each one against **[indiacode.nic.in](https://www.indiacode.nic.in)** and update the *Verified* column.
>
> Judges notice a fabricated citation far more often than teams expect. An unverified marker costs you
> nothing; a confident wrong section number costs you the room.

The same `[VERIFY]` markers appear in the code - `server/src/services/deadlines.ts`,
`server/src/services/wsd.ts`, `server/src/routes/cases.ts` - so they cannot be forgotten.

## Why this matters

India's criminal law was rewritten in 2023, effective 1 July 2024, and the new statutes **explicitly
assume digital evidence infrastructure**. PRAMANA is not ahead of the law. It is the thing the law now
requires and which does not yet properly exist.

The single most important fact in this project: **the prescribed certificate for electronic evidence
asks for the hash value of the record and the algorithm used.** The law asks for a hash. Nobody has
automated producing it.

## Obligation → feature

| # | Obligation | Source (verify) | PRAMANA feature | Where | Verified |
|---|---|---|---|---|---|
| 1 | Electronic records have the same standing as documents | BSA 2023 | Every artefact is a first-class sealed object | `services/documents.ts` | ☐ |
| 2 | **Certificate with hash value and algorithm** | BSA 2023, certificate schedule | Auto-generated, pre-filled at production from seal-time data | `services/certificate.ts` | ☐ |
| 3 | Certificate signed by device custodian **and** an expert | BSA 2023 | Dual-signature workflow; same person cannot sign both roles | `services/certificate.ts` | ☐ |
| 4 | e-FIR / electronic information, signed within three days | BNSS s.173(1) proviso | `efir_signature` deadline, 3 days | `services/deadlines.ts` | ☐ |
| 5 | Search and seizure recorded on audio-video, forwarded without delay | BNSS s.185 | Media ingestion, hashing, sealed transmission | `services/documents.ts` | ☐ |
| 6 | Forensic team visit and videography, offences ≥ 7 years | BNSS s.176(3) | `forensic_visit` deadline, 3 days; FSL custody chain | `services/deadlines.ts` | ☐ |
| 7 | Progress intimation to informant within 90 days | BNSS s.193(3)(ii) | Automated notification with an **anchored delivery receipt** | `routes/demo.ts` | ☐ |
| 8 | Supply of copies to accused and victim within 14 days | BNSS s.230 | One-click redacted disclosure rendition; deadline tracker | `routes/documents.ts` | ☐ |
| 9 | Sexual-offence investigation completed within two months | BNSS s.193(3) proviso | 60-day countdown, escalation at 60/80/90% | `services/deadlines.ts` | ☐ |
| 10 | Medical examination report forwarded within the stipulated period | BNSS s.184(6) | `medical_report_forwarding` deadline, 7 days | `services/deadlines.ts` | ☐ |
| 11 | Charge sheet within the custody limit (60/90 days) | BNSS s.187(3) | `chargesheet_custody_limit` deadline | `services/deadlines.ts` | ☐ |
| 12 | Statements of women/child victims recorded by a woman officer | BNSS s.176(1) proviso; POCSO s.24 | **Blocked at upload** unless the account carries the attribute; attempt logged | `services/wsd.ts` | ☐ |
| 13 | Victim identity non-disclosure is itself an offence | BNS; POCSO; *Nipun Saxena v. Union of India* (2018) | Victim Identity Vault; pseudonym everywhere; dual-auth reveal | `services/wsd.ts` | ☐ |
| 14 | Sealed-cover handling under court direction | Supreme Court directions | Shamir *m-of-n* threshold custody, waiting period, on-chain record | `services/sealedCover.ts` | ☐ |
| 15 | Proceedings may be held in electronic mode | BNSS | Court-ready electronic bundle with integrity manifest | `services/certificate.ts` | ☐ |
| 16 | Digital signature legal recognition | IT Act 2000; CCA-licensed CAs | DSC / eSign integration point (**simulated** in this build) | `core/signing.ts` | ☐ |
| 17 | 180-day in-country log retention, clock sync, incident reporting | CERT-In Directions, April 2022 | Append-only audit log, NTP-synced timestamps, incident workflow | `services/audit.ts` | ☐ |
| 18 | Purpose limitation, security safeguards, breach handling | DPDP Act 2023 | Mandatory purpose codes stored with every event; envelope encryption | `policy/ruleset.ts` | ☐ |
| 19 | Records classified by retention class; destruction recorded | Public Records Act 1993; state police manuals | Retention classes, disposal proposal, **signed certificate of destruction** | `services/retention.ts` | ☐ |
| 20 | Interoperability across the justice pillars | ICJS mandate | ICJS-shaped integration bus (interfaces only in this build) | - | ☐ |

## The insight worth stating out loud

The new procedure code creates roughly a dozen hard deadlines and several new mandatory digital
artefacts. **Nobody has built the compliance layer for them.** Police stations are tracking two-month
statutory deadlines on paper registers. That is the gap - not document storage, which is a solved
problem everywhere else.

## Existing systems - integrate, do not duplicate

A judge from NCRB will ask about these. Know them.

| System | What it is | PRAMANA's position |
|---|---|---|
| **CCTNS** | NCRB's backbone across ~16,000 police stations; FIR registration and the Integrated Investigation Forms (IF-1…IF-5) | **This is where documents originate.** We do not replace it; we are the document and evidence layer beside it |
| **ICJS** | The platform connecting police, courts, prosecution, prisons and forensics | **Our integration bus.** "We plug into ICJS" answers the interoperability question |
| **eSakshya** | NCRB's app for crime-scene and search-seizure videography under the new BNSS requirements | **eSakshya captures; PRAMANA seals, versions, custody-tracks, retains and produces.** We integrate rather than rebuild |
| **eCourts / CIS / NJDG** | The judicial side | Receives sealed electronic bundles with integrity manifests |
| **ITSSO, NDSO, CCPWC, ERSS-112** | Women Safety Division adjacent systems | Referenced by the WSD module |
| **DigiLocker** | Citizen document delivery | Outbound channel for FIR copies, notices and orders |
| **NIC Cloud / MeghRaj** | MeitY-empanelled government hosting | Where this actually runs. Data stays in India, on government infrastructure |

## Reading the "expected solution" anomaly

The problem statement's expected-solution field says *"develop a system to monitor and manage police
assets throughout their lifecycle"* - which does not match its own description. This is almost certainly
copy-paste residue from a different statement, and it happens routinely in SIH listings.

Do not ignore it, and do not build an asset tracker. Handle it in one line:

> "We read that as lifecycle management, and we treat every document as a custodial asset. A charge
> sheet has an owner, a custody chain, a location, a condition, a retention period and a disposal date -
> exactly like a seized weapon in a malkhana. Our custody ledger already extends to physical evidence
> with QR tags, malkhana location and seal status."

That is implemented: `custody_events` and `exhibits` share one ledger, and `CustodyLedger.sol` carries a
`SubjectType` of `Document` or `Exhibit`. It converts a liability into evidence that you read the brief
carefully.

## Pre-submission checklist

- [ ] Every BNSS/BSA/BNS section number above, against indiacode.nic.in
- [ ] The exact prescribed format of the electronic-evidence certificate, including its hash field
- [ ] The *Nipun Saxena* citation and the specific directions it issued
- [ ] Current CCTNS police-station coverage figures before quoting "16,000"
- [ ] Whether eSakshya's current scope overlaps anything claimed here
- [ ] CERT-In direction details - retention period and reporting window
- [ ] Court pendency and adjournment statistics before quoting any of them
- [ ] Existence, licence and citation for every dataset or model named
- [ ] That at least one team member can explain Merkle batching unprompted - it is the question you are
      most likely to be asked
