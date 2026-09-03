# PRAMANA — architecture

## The shape of the problem

A case file today lives in physical bundles, on personal laptops, in shared email inboxes, on WhatsApp,
in three unconnected systems, and in record rooms. Nobody can find things; the wrong people can read
them; documents can be altered and the alteration cannot be disproved; there is no version control, no
inter-agency handoff, no audit trail, and therefore no accountability.

No single step in that is a scandal. The accumulation is the problem.

Four requirements fall out, in priority order:

| # | Requirement | What it actually means |
|---|---|---|
| 1 | **Integrity** | Prove a document has not been altered since it was created, in a way a court accepts |
| 2 | **Confidentiality** | Only the right person sees a document, and every look is recorded |
| 3 | **Findability** | A twelve-year-old file, partly handwritten, partly in Hindi, retrievable in seconds |
| 4 | **Auditability** | Reconstruct the complete life history of any document |

Everything else — collaboration, workflow, dashboards — is downstream of these.

## Design principles

1. **The chain stores proof, never content.** No case data on-chain, ever. Enforced by a guard that
   throws (`server/src/ledger/guard.ts`), not by discipline.
2. **The original is immutable; everything else is a rendition.** Redactions, translations, OCR text and
   AI annotations are separate objects with their own hashes, linked to but never overwriting the seal.
3. **Deny by default.** No implicit access, no "admin sees everything", no role that can read a sealed
   document alone.
4. **Every action is evidence.** The audit log is designed to be produced in court, not read by an admin.
5. **AI assists, never decides.** No AI output is evidence.
6. **Assume the insider is hostile.** Design as though a legitimate credential is already compromised.
7. **Legal validity over technical elegance.** An elegant system that produces an inadmissible document
   has failed.

## The lifecycle

```
CAPTURE → SEAL → CLASSIFY → STORE → USE → TRANSFER → PRODUCE → RETAIN → DISPOSE
   │        │        │         │       │       │          │         │        │
   │        │        │         │       │       │          │         │        └─ cryptographic erasure
   │        │        │         │       │       │          │         │           + signed certificate,
   │        │        │         │       │       │          │         │           unless legal hold
   │        │        │         │       │       │          │         └─ retention class applied
   │        │        │         │       │       │          └─ court bundle + evidence certificate
   │        │        │         │       │       └─ signed custody handoff, both parties
   │        │        │         │       └─ every view/print/share logged + watermarked
   │        │        │         └─ encrypted, write-once, versioned
   │        │        └─ language, entities, sensitivity, case linkage (derived namespace)
   │        └─ hash + device attestation + signature + on-chain anchor
   └─ console / scanner / field capture / partner system
```

**The property everything rests on:** sealing happens at step 2, before the document has travelled
anywhere or been seen by a server administrator. Everything after that is verifiable against that seal.

## Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENTS   Officer console · Public verifier · Citizen portal            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  bearer token (prod: mTLS + DSC + device posture)
┌──────────────────────────────┴──────────────────────────────────────────┐
│ GUARD (server/src/guard.ts)                                             │
│ authenticate → ABAC evaluate → audit record → anomaly rescore           │
│ Single choke point. A denial is logged as carefully as a grant.         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────────────┐
│ SERVICES                                                                │
│  documents  custody  audit  certificate  wsd  sealedCover  retention    │
│  deadlines  search  extraction  redaction  anomaly  keys  storage       │
└───┬─────────────────┬──────────────────┬──────────────────┬─────────────┘
    │                 │                  │                  │
┌───┴──────┐   ┌──────┴──────┐   ┌───────┴──────┐   ┌───────┴──────────┐
│ OBJECT   │   │ METADATA    │   │ DERIVED      │   │ LEDGER           │
│ STORE    │   │ SQLite      │   │ NAMESPACE    │   │ local consortium │
│ write-   │   │ (prod:      │   │ OCR text ·   │   │ or permissioned  │
│ once,    │   │ Postgres +  │   │ embeddings · │   │ EVM (6 contracts)│
│ AES-GCM  │   │ RLS +       │   │ entities     │   │ anchors only     │
│          │   │ pgvector)   │   │ never on the │   │                  │
│          │   │ + FTS5      │   │ original     │   │                  │
└──────────┘   └─────────────┘   └──────────────┘   └──────────────────┘
```

## Cryptography

**Key hierarchy** — `document data key → case key → master key`. Every document gets its own AES-256-GCM
key, so compromise of one key exposes exactly one document. The document id is bound in as associated
data, so a ciphertext cannot be moved between documents.

**Hashing** — SHA-256, with the algorithm identifier stored beside every digest so migration to a
stronger function is a planned re-anchoring rather than a crisis.

**Signatures** — Ed25519, labelled `SIMULATED-DSC` everywhere it surfaces. Production signs with the
CCA-licensed Class 3 token officers already carry, or Aadhaar eSign.

**Threshold custody** — Shamir over GF(2^8) for Level-4 sealed cover. On sealing, the single-party
wrapped key is **destroyed**, so from that moment the only route to the plaintext is *m* of *n*
custodians cooperating. Fewer than *m* shares reveal nothing — not less information, nothing.

## Why a blockchain, and precisely what it does

A database cannot provide the one property that matters here: **non-repudiable ordering across
institutions that do not trust each other.** Whoever controls a database can change it, including its
timestamps. The consortium is the argument — independent nodes run by NCRB, the State CID, the
judiciary, the forensic laboratories and the prosecution directorate. None reports to another, so no
single institution can rewrite history, and the bodies with an incentive to alter a record are checked
by bodies with an incentive to catch them.

**What goes on chain:** document hashes and version pointers, custody events with *pseudonymous* actor
references, Merkle roots of audit batches, the hash of the active access-policy set, seal and unseal
events, legal holds and destruction certificates.

**What never does:** document content in any form, names, addresses, identification numbers, case
narratives, or anything from which content could be inferred. Actor identifiers are pseudonymous even
on a permissioned chain — otherwise the ledger itself becomes a permanent surveillance record of which
officer touched which case.

### Scaling honestly

Sixteen thousand police stations, tens of thousands of documents a day, audit events an order of
magnitude beyond that. Per-event transactions are not viable, and saying otherwise would be dishonest.

- **Document hashes** are anchored individually — that volume is manageable and each document deserves
  its own on-chain identity.
- **Audit events** are batched into Merkle trees, one root anchored per scope per window. Millions of
  events collapse into a handful of transactions, and every event still gets an individually verifiable
  inclusion proof. This is the design detail that separates understanding blockchain from having heard
  of it.
- **Custody events** stay individual — they are rare and evidentiarily critical.

The `AuditAnchor` contract verifies the same proofs the server produces. The contract test suite builds
a proof in TypeScript and checks it in Solidity, so the two implementations are pinned to each other.

## Access control

ABAC, not roles. A decision is computed from rank, unit, district, explicit case assignment, document
sensitivity, purpose code, time of day, share grants and break-glass state. Rules are **data**
(`server/src/policy/ruleset.ts`), so a change in the law is a policy edit and a new anchored version,
not a release.

Evaluation is **deny-overrides with an implicit final deny**: every deny rule is tested first, then
permits, and anything nobody explicitly permitted is refused.

The hash of the active policy set is anchored with its effective period. That is what lets us answer, in
a hearing years later, *which rules governed this access on that day* — closing an argument the defence
would otherwise open.

Notable consequences, all covered by tests in `server/src/policy/engine.test.ts`:

- **Rank alone opens nothing sensitive.** An unassigned Superintendent gets a request button, not the file.
- **Sealed cover is unreadable through ordinary access**, including by break-glass, including by the
  assigned officer, including by the administrator.
- **The CISO reads the audit trail and has no rule anywhere granting access to case content.**
- **A purpose code is mandatory** on every content read, is stored with the event, and is anomaly-scored.
- **Break-glass exists, because it must** — time-boxed, justified in writing, notifying two supervisors,
  permanently flagged. Emergency access should be possible and uncomfortable.
- **Clearance gates content, not custody.** A record-room clerk lawfully destroys material they were
  never cleared to read; that is what cryptographic erasure is for.

## The Women Safety Division module

The problem statement is sponsored by the Women Safety Division, not NCRB generally. Two ideas do the work.

**Sensitive Case Mode is automatic.** Registration under a sexual-offence, POCSO, trafficking or
domestic-violence section escalates the case on the spot. No officer has to remember. De-escalation
requires DSP rank and a recorded reason: errors fail towards protection.

**The victim's identity is never in the working documents at all.** It lives in a separately encrypted
vault; every document, index entry, search result, notification and export refers to a stable pseudonym.
De-anonymisation is a distinct privileged operation — dual authorisation, written justification,
enforced waiting period, all-supervisor notification, anchored on chain.

Today, compliance depends on an officer remembering to be careful with a name written in plain text
across forty documents. Here it is structural: **an officer cannot leak what the system never showed him.**

Statutory role requirements are enforced at the point of upload rather than found in an audit months
later: where the law requires a woman police officer to record a statement, only an account carrying
that attribute can create that document class, and blocked attempts are logged.

## AI, and its guardrails

The pipeline — preprocess, language detection, OCR, classification, entity extraction, sensitivity
scoring, embeddings, date extraction, entity resolution, PII detection — writes everything to a
**derived-metadata namespace**, versioned independently and marked machine-generated. It never touches
the sealed original.

1. **AI output is never evidence.** It is an index, a search aid, and a proposal for human action.
2. **Every AI field is visibly marked** with a confidence score and a human-verification state.
3. **Redaction proposals require human confirmation** before a redacted rendition is issued.
4. **No sensitivity de-escalation by AI.** A model may raise a classification; only a human may lower it.
5. **No predictive policing, no risk scoring of individuals, no bail or guilt prediction.** Not because
   it is technically hard — because it is the wrong thing to build. We considered it and rejected it.

## Demo vs production — every gap, stated

| Area | This repository | Production |
|---|---|---|
| Signing | Ed25519 keypair per officer, labelled `SIMULATED-DSC` | CCA-licensed Class 3 DSC token or Aadhaar eSign |
| Key custody | Master key in a file under `server/storage/keys/` | Generated in and never leaving an HSM; rotation, escrow, documented recovery ceremony |
| Database | SQLite + FTS5, zero setup | PostgreSQL with row-level security + pgvector, OpenSearch |
| Object store | Local files, write-once by convention | MinIO/S3 with object lock (WORM), versioning, legal-hold flags |
| Ledger | Embedded hash-linked chain, five simulated validators in one process | QBFT/IBFT permissioned network, one node per institution |
| OCR | Corpus ships transcripts, treated as OCR output with confidence and a verification queue | Self-hosted Indic OCR + handwriting model, on-premise |
| Embeddings | Hashed n-grams + curated bilingual lexicon | MuRIL / IndicBERT, on-premise |
| Auth | Bearer token, shared demo password | mTLS, hardware MFA, device binding, short-lived tokens |
| Integrations | Interfaces defined; no live systems | CCTNS · ICJS · eCourts · eSakshya · FSL LIMS · DigiLocker · SIEM |
| Anomaly detection | Deterministic rules layer | Rules plus sequence/frequency models over the same event stream |

The rules layer stays in production regardless: an alert an officer cannot explain to a court is not
much use.

## Deployment story

MeitY-empanelled government cloud (NIC / MeghRaj). All storage, all keys, all logs resident in India on
government-controlled infrastructure. All models on-premise — **no third-party API sees case content.**
For MHA this is not a detail, it is a precondition.

Audit log design targets CERT-In: 180-day in-country retention, NTP-synchronised clocks, a defined
incident-reporting workflow, and SIEM export for the department's existing security operations.
