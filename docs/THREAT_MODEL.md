# Threat model

## Who this is designed against

State this explicitly in the pitch. It signals security maturity, and most teams will not do it.

**The malicious insider.** The single largest realistic threat in this domain — an officer with entirely
legitimate credentials leaking a sensitive case file to media or to the accused. Leaked material from
sensitive cases reaching the press is a recurring, well-documented problem, and because everyone had
access, nobody can be identified as the leaker. Everything about the access and audit design targets
this person.

**The pressured insider.** An officer instructed by someone senior to make a document quietly disappear.

**The external attacker.** Ransomware against a state police data centre is not hypothetical.

**The future defence counsel.** Every design decision should survive the question *"can you prove that?"*
asked five years later by someone paid to find the gap.

## Threats and mitigations

| Threat | Vector | Mitigation | Implemented |
|---|---|---|---|
| **Insider — leak** | Authorised officer copies a sensitive file to the media | Least-privilege ABAC; identity vault (they never see the name); dynamic watermarking for attribution; export controls; UEBA alerting | Yes |
| **Insider — tampering** | Officer alters a document to fit a theory | Immutable originals; on-chain anchor; alteration detected on next verification and provable in court | Yes |
| **Coerced deletion** | Senior pressure to make a document vanish | The anchor persists; the document's prior existence stays provable even if the object is gone | Yes — `verifyDocument` returns `missing` with the anchor intact |
| **Database administrator** | Privileged operator edits records directly | Encrypted at rest with keys the DBA does not hold; audit roots on an independent ledger | Partial — full separation needs the HSM |
| **Credential theft** | Phishing, stolen token | Hardware MFA, device binding, behaviour anomaly detection, short sessions | Anomaly detection yes; MFA is a production gap |
| **Ransomware** | Encryption of the primary store | WORM object lock, immutable snapshots, offsite replication; anchors prove what existed regardless of what the attacker did to storage | Write-once by convention here; object lock in production |
| **Network interception** | MITM on a state network | mTLS everywhere, client-side encryption for the highest classes, certificate pinning on mobile | Production |
| **Lost or stolen field device** | Officer's phone taken | Device encryption, remote wipe, no plaintext at rest, queued items encrypted to a server key the device cannot read back | Design only — no mobile app in this build |
| **Supply chain** | Compromised dependency | SBOM, dependency pinning, signed builds | Partial — lockfile committed, CI runs on clean installs |
| **Model poisoning** | Adversarial input degrading AI | AI output is non-authoritative by design, so the blast radius is search quality, never evidence | Yes, structurally |
| **Denial of service** | Availability attack during a filing window | Rate limiting, WAF, offline-capable clients, degraded read-only mode | Production |
| **Sealed-cover compromise** | Attempt to unseal without authority | Threshold decryption, waiting period, all-custodian notification, on-chain record of every attempt | Yes |
| **On-chain data leak** | Personal data written to an immutable ledger by mistake | A guard inspects every anchor payload and **throws**; it is not overridable | Yes — `ledger/guard.ts` |

## The properties that survive a compromise

Worth being precise, because this is what the design actually buys:

**If an attacker takes the application server:** they cannot forge history. Anchors already written are
immutable, and re-anchoring an existing payload hash reverts on chain. They cannot decrypt sealed-cover
material — those keys are split across custodians and the single-party copy was destroyed at sealing.
They cannot unseal one either, because the waiting period is enforced in the contract, not the app.

**If an attacker takes the database:** documents are ciphertext, and the keys are wrapped by a master
key held elsewhere. The audit trail's integrity does not depend on the database, because the batch roots
are on an independent ledger — deleting rows is detectable.

**If an attacker encrypts everything with ransomware:** the anchors prove exactly what existed and when,
so the record can be reconstructed and its completeness demonstrated.

**If a single officer is corrupt:** they see only what they are assigned, every look is attributed and
watermarked, bulk behaviour is flagged to their supervisor, and on a Women Safety case they never saw
the victim's name in the first place.

**What still defeats us:** collusion at the threshold — *m* of *n* custodians acting together can unseal
anything, by design, because that is what "authorised access" has to mean. And the master key in this
build is a file. In production it is in an HSM, and that gap is stated rather than hidden.

## Zero-trust posture

No implicit trust from network location. Every request authenticated, authorised against the currently
installed policy, and logged. Service-to-service traffic uses mutual TLS with short-lived certificates in
production. Assume the perimeter is already breached and design accordingly — because in a system
spanning sixteen thousand stations, eventually it will be.
