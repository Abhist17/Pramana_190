# Demo script — five minutes

Rehearse this eight times. Record a backup video. **Assume the wifi will fail — everything runs locally.**

## Before you start

```bash
npm run reset && npm run dev
```

Open two browser tabs: the console at `http://localhost:5173` and the public verifier at
`http://localhost:5173/verify`. Sign in as `r.deshmukh` / `pramana`. Set the **Access purpose**
selector in the top bar to `INVESTIGATION`.

SI Deshmukh is the investigating officer on the Women Safety cases and a co-investigator on the general
Kalmeshwar case, so steps 1 through 4 and step 6 all run from this one account — no switching mid-pitch.

Have two more browser profiles (or private windows) already signed in as `a.pawar` and `m.iyer`. Step 5
needs both, and switching accounts live wastes fifteen seconds you do not have.

---

## 0:00 — 0:30 · The hook

> "In a courtroom somewhere in India today, a photograph is being doubted. Not because anyone thinks it
> was faked — because nobody can prove it wasn't. The officer who took it has retired, the phone was
> replaced, there is no hash, no timestamp, no device record. The defence only has to raise doubt, and
> it works.
>
> Here is how that ends."

Do not open anything yet. Say this to the room, not to the screen.

## 0:30 — 1:15 · Capture and seal

**Cases → FIR/2026/0142 → Capture document.** Upload any file.

Point at the response as it lands:

> "Fingerprinted with SHA-256, encrypted under a key that exists only for this document, signed with
> the officer's credential, and the fingerprint written to the consortium ledger — in that order,
> before it was stored. The seal was made at capture, not after it reached a server an administrator
> controls."

Open the document. Show the **Seal record** panel: algorithm, fingerprint, block number.

## 1:15 — 2:00 · The tamper demonstration — *do not rush this*

Open **Scene photograph — bus stand approach road** → **Integrity** tab → **Verify integrity**.
Green. Then **Flip one bit**.

> "One bit. The digital equivalent of changing a single pixel."

Re-verify. The red banner fires and the two digests appear character by character with every
difference highlighted.

> "Sixty of sixty-four characters changed, from one bit. That is what a fingerprint does — you cannot
> work backwards from it, and you cannot construct a different file that produces the same one.
>
> And the anchored value on the ledger did not change. It cannot. Five institutions hold a copy and
> each block commits to the one before it. This document is now *provably* altered."

The object is locked, the CISO alerted, an incident opened — point at the alert count in the sidebar.

Click **Restore original** before moving on.

## 2:00 — 2:30 · The evidence certificate

Same document → **Evidence certificate** → **Generate**.

> "The 2023 evidence statute requires a certificate for electronic records, and the prescribed format
> asks for the hash value and the algorithm used. **The law now asks for a hash.** Nobody has automated
> producing it — today an officer reconstructs this from memory three years later.
>
> This is filled from data captured at seal time: hash, algorithm, device, capture circumstances, the
> full custody chain, and a verification run at the moment of production."

Sign as **device custodian**. Note it refuses to let the same person sign twice — the statute wants two
people. Open the PDF.

## 2:30 — 3:15 · Access control that explains itself

Two independent barriers, shown back to back. Both denials land in the audit trail with the officer's
identity, the purpose they selected and the rule that refused them.

Switch to **a.pawar** and open **FIR/2026/0157** (the Women Safety case).

Refused: `deny-clearance-below-sensitivity`.

> "Same police station, same rank as the investigating officer. His clearance does not reach this
> classification, so he does not get in — and he is told exactly why."

Now switch to **m.iyer** — a *Deputy Superintendent*, two ranks senior, whose clearance is high enough.
Open the same case.

Refused again, on a different rule: `deny-sensitive-case-without-assignment`.

> "This is the one that matters. She outranks everyone in that station and she is cleared for this
> classification — and she still does not get in, because she is not assigned to this case. Rank grants
> nothing here. She gets a request button, not the file.
>
> That is the difference between a system that logs misuse and one that prevents it."

Back as **r.deshmukh**, open the same case:

> "Same case, assigned officer. Note the complainant — **VICTIM-G98082**. That pseudonym is what appears
> in every document, every index entry, every search result, every notification and every export. Her
> name is not in the working file at all; it is encrypted in a separate vault, and revealing it takes
> dual authorisation, a written justification and a waiting period.
>
> An officer cannot leak what the system never showed him."

If you have time: **Access policy → simulate** any officer against any case and show every rule that fired.

## 3:15 — 3:45 · Search across scripts

**Search** → `witness saw a maroon vehicle near the school`.

> "Query in English. The top two results are handwritten Hindi statements — the document says
> *मैरून गाड़ी प्राथमिक विद्यालय के पास*. Not one word overlaps. In Indian policing this is the
> difference between search working and not working."

Point at the withheld count:

> "And documents I am not entitled to do not appear — not even as a 'restricted' row, because the
> existence of a sealed matter can itself be sensitive."

Then **Run analysis** on cross-case links:

> "The same phone number in three unconnected FIRs across two districts. For NCRB that is the mandate —
> national pattern detection."

## 3:45 — 4:15 · Audit and anomaly

**Audit trail.** Point at the numbers, then at one event's **proof** button.

> "Every read, download, print, denial — and every search query, because searching for a case you have
> no connection to is itself a signal.
>
> One transaction per event would bury any chain: sixteen thousand police stations, millions of events a
> day. So we build a Merkle tree per window and anchor only the root. This single log line still gets a
> proof — three sibling hashes prove it belongs to a batch of twenty-three, so it cannot have been
> inserted, removed or back-dated."

Click **Verify via the public endpoint**.

> "Verified without trusting this server. The same contract on chain checks the same proof."

## 4:15 — 4:45 · Hand over the laptop

Switch to the **/verify** tab. Then physically turn the laptop toward a judge.

> "Drop any file in. Please — use one of your own first."

An unknown file: **NOT FOUND**. Then the sealed scene photograph: **VERIFIED**, with the anchoring time.

> "No account, no login. It tells you whether that exact fingerprint was anchored and when, and nothing
> about content, case or parties. Defence counsel can check our claim themselves — which is precisely
> what makes it worth anything."

## 4:45 — 5:00 · Close

Show `docs/LEGAL_MAPPING.md` on one slide.

> "Every row is a statutory obligation created by the 2023 criminal statutes. Every row is a feature.
> Those laws assume digital evidence infrastructure that does not yet exist. We are not proposing
> something ahead of the law — we are proposing the thing the law now requires."

---

## Questions you will be asked

**"Why blockchain? Why not a database?"**
> A database gives no independent ordering. Whoever controls it can change it, including its timestamps.
> We need a record that an institution cannot rewrite even when it is the institution under scrutiny.
> Nodes run by NCRB, the State CID, the judiciary, the FSLs and prosecution — none reports to another.
> We use it for exactly that and nothing else: hashes, custody events, batch roots and policy hashes.
> No case data touches the chain, ever.

**"Does this scale?"**
> Not with one transaction per event, and we do not claim it does. Document hashes are anchored
> individually; audit events are Merkle-batched with one root per station per window, so millions of
> events become a handful of transactions and every event keeps an individually verifiable proof.
> Custody events stay individual because they are rare and evidentiarily critical.

**"What about the expected-solution line about police asset lifecycle?"**
> We read it as lifecycle management, and we treat every document as a custodial asset — a charge sheet
> has an owner, a custody chain, a location, a condition, a retention period and a disposal date,
> exactly like a seized weapon in a malkhana. The same custody ledger already carries physical exhibits
> with QR tags, malkhana location and seal status.

**"Will officers actually use it?"**
> That is the real risk, and it is not a cryptography problem. It has to be faster than the register for
> the officer's most common action, work offline, run in the vernacular, and never require the same fact
> typed twice. If it is slower than paper it fails regardless of what is under it.

**"How accurate is the handwriting OCR?"**
> We are not claiming solved accuracy — handwritten Devanagari is realistically the weakest link in the
> whole pipeline. Anything below the confidence threshold goes to a human verification queue rather than
> silently into the index, and you can see the confidence score and verification state on every
> extracted document.

**"Are these real section numbers?"**
> They are research leads, and they are marked `[VERIFY]` in the code and the UI for exactly that
> reason. Confirming them against indiacode.nic.in is on the pre-submission checklist. We would rather
> show you an unverified marker than a confident wrong citation.
