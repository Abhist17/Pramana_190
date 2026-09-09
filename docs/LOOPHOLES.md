# Loopholes

Everything found wrong with PRAMANA, in the order it is worth fixing.

This is an adversarial read of our own code, written the way a judge or an STQC
auditor would read it. Where a finding was confirmed by running the system, it is
marked **verified live** and the exact call is given. Where it is a reading of the
code, it says so. Nothing here is speculative severity inflation - a finding is
rated by what an insider could actually do with it.

Two of the findings below directly contradict claims we make on the first page of
the README. Those are the ones to fix first, because a demo that is caught making
a claim it cannot keep costs more than the feature was worth.

---

## Severity key

| | Meaning |
|---|---|
| **S1** | Breaks a headline claim, or lets an unauthorised person reach protected material |
| **S2** | Real weakness an attacker or a hostile examiner could exploit |
| **S3** | Hardening, hygiene, or a claim that needs rewording rather than a code change |

---

## A. Access control

### A1 - S1. The Women Safety case list is readable by anyone with a login

`server/src/routes/wsd.ts` - `GET /overview` has no `authorise()` call. It returns
every case with `sensitive_mode = 1`: case number, offence category, station,
district, victim pseudonym, statutory deadlines and the pending de-anonymisation
queue.

**Verified live.** The same officer, in the same session:

```
GET /api/cases/CASE_MTNEBFAJPQ38CXF49H   as a.pawar  ->  403  deny-clearance-below-sensitivity
GET /api/wsd/overview                    as a.pawar  ->  200  3 sensitive cases, in full
GET /api/wsd/overview                    as d.security (CISO) -> 200  the same 3 cases
```

This breaks two claims we make out loud:

- *"Sign in as an unassigned Superintendent and a Women Safety case stays shut."*
  It does not stay shut. The side door lists it.
- *"The CISO reads the audit trail - and has no path to case content at all."*
  The CISO has a path.

It is also invisible: because the route never calls `authorise()`, **no audit event
is written**. The one access we would most want on the record is the one we do not
record.

**Fix.** Route the overview through `authorise()` per case, exactly as
`GET /api/cases` already does, and return only the permitted rows. The pattern is
four lines and already exists in `routes/cases.ts`.

### A2 - S1. The policy simulator leaks the thing the policy is protecting

`server/src/routes/security.ts` - `POST /policy/simulate` has no `authorise()`.
Any signed-in user may name any other user and any case, and receives back the
decision plus `subject`, which contains that user's full case-assignment map,
clearance level, rank and district.

**Verified live.** `a.pawar`, holding a 403 on FIR/2026/0163, called the simulator
and learned that the case exists and that `r.deshmukh` is the investigating officer
on it - by asking a question about somebody else.

The existence of a sensitive matter is itself sensitive; `routes/search.ts` says so
in a comment and gets it right. The simulator does not.

**Fix.** Require `admin.policy` (CISO and admin hold it), or restrict the simulator
to subjects the caller may already see and echo back only the caller's own subject.

### A3 - S1. Thirty-two routes never reach the policy engine

`guard.ts` calls itself "the single choke point for access". It is not the only
door. Routes with no `authorise()` call:

| File | Routes | Assessment |
|---|---|---|
| `routes/security.ts` | `/alerts`, `/alerts/:id/acknowledge`, `/baseline/:userId`, `/users`, `/policy`, `/policy/simulate`, `/ledger/status`, `/retention`, `/retention/hold`, `/deadlines/board`, `/deadlines/:id/complete`, `/dashboard` | Open. `/alerts` and `/ledger/status` **verified live** returning 200 to a plain SI |
| `routes/wsd.ts` | `/overview`, `/assess`, `/sensitive-mode`, `/sealed/:id`, the vault approve/reveal pair, the sealed request/approve/open trio | Mixed - see below |
| `routes/documents.ts` | `/custody/:eventId/acknowledge`, `/certificates/:id`, `/certificates/:id/pdf`, `/certificates/:id/sign` | Open (read of code) |
| `routes/demo.ts` | `/tamper/:id`, `/restore/:id`, `/notify/:caseId`, `/reset-alerts` | Open, see A5 |
| `routes/cases.ts` | `POST /`, `/links/cross-case` | Case creation is unchecked |

Two that matter most:

- **`POST /alerts/:alertId/acknowledge`** lets any signed-in user clear open
  integrity and anomaly alerts. An insider who tampers with a document can
  acknowledge the alarm it raised. That is anti-forensics, available to everyone.
- **`GET /documents/certificates/:id`** returns a full evidence certificate -
  case number, document title, device, capture circumstances, custody history,
  hash - to any authenticated caller who has the id. The corpus seeds no
  certificates, so this one is a code reading rather than a live probe.

In fairness, the WSD vault and sealed-cover routes **do** enforce their ceremony in
the service layer (`approveDeanonymisation` takes the caller's rank;
`openSealed` checks threshold shares). Those are defence-in-depth gaps, not open
doors. But they still bypass ABAC and still write no audit event, which is half the
point of having a choke point.

**Fix.** Add `authorise()` to every route in that table. Then add a test that walks
the route table and fails if a non-public route lacks a policy call, so this cannot
regress.

---

## B. Integrity and cryptography

### B1 - S1. Verification checks the database, not the ledger

`server/src/services/documents.ts:248`:

```ts
const matches = hashesEqual(document.hash_value, actualHash);
```

`document.hash_value` is a **SQLite column**. The anchor row is loaded immediately
above it, but only to display `tx_ref` and `block_number` - its payload is never
compared.

So the sentence in the README - *"the fingerprint anchored on the ledger did not,
and cannot"* - is not what the code checks. An attacker with write access to the
database edits the stored object *and* `documents.hash_value`, and verification
returns `verified`. The blockchain is sitting right there holding the correct
value, unconsulted.

This is the single highest-value fix in the repository. It is roughly ten lines,
and it converts the tamper demo from a claim about the ledger into a demonstration
of it.

**Fix.** Read `payload.documentHash` from the anchor, compare all three - stored
object, database row, anchored value - and add a third status,
`anchor_mismatch`, for the case where the database and the ledger disagree. That
status is the interesting one: it is what a database-level attack looks like, and
right now we cannot detect it at all.

### B2 - S2. The on-chain personal data guard does not recurse

`server/src/ledger/guard.ts` iterates `Object.entries(request.payload)` one level
deep and `continue`s on any non-string value. So this passes untouched:

```js
{ meta: { victimName: 'Priya Sharma', phone: '9876543210' } }
```

The key filter is also English-only, and the length ceiling of 128 characters still
allows a sentence of narrative. We describe this guard as "not overridable, because
an on-chain leak cannot be deleted" - which is exactly why it should not have a
hole this simple.

**Fix.** Walk the payload recursively, applying the key and value tests at every
depth, and reject arrays of strings too. Add a test that feeds it a nested victim
name.

### B3 - S2. Officers' private keys sit in the database in plaintext

`users.private_key` holds an unencrypted PKCS#8 Ed25519 key, and every signature -
custody transfer, evidence certificate, handover manifest - is produced server-side
with `request.user!.private_key`.

The simulated-DSC labelling is honest about the *certificate*. It is not honest
about the *threat model*: whoever holds the server can forge any officer's
signature on any custody event, retroactively. Non-repudiation is therefore worth
exactly as much as the server, which is the thing the consortium ledger exists to
avoid trusting.

**Fix.** Nothing to build for the demo - but say it this way in the pitch: *"the
key stays in the officer's token and signing happens on the officer's machine; in
this prototype we hold the key server-side and that is the gap."* Wrap the keys with
the master key at minimum, so a database dump alone is not sufficient.

### B4 - S2. The audit log is append-only by convention

`audit_events` is an ordinary table. The Merkle batching gives real tamper
*evidence*, but only after a batch is sealed - `auditBatchIntervalMs` defaults to
30 seconds. An event deleted inside that window leaves no trace whatsoever, because
nothing has committed to it yet.

**Fix.** Chain each event to the previous one (`prev_leaf_hash` in the leaf
payload). Then a deletion breaks the chain immediately rather than at the next
anchor, and the anchored root still works exactly as it does today.

### B5 - S2. The audit trail is a content side-channel

`routes/search.ts` records the raw query string in `detail.query`. Denials record
document titles and reasons. The CISO can read all of it.

An officer who types `Priya Sharma statement` has put a victim's name into a table
that the role we describe as having "no path to case content" reads freely. The
identity vault goes to great lengths to keep that name out of the documents; the
search box puts it back.

**Fix.** Store a hash of the query plus its term count, or redact it to the matched
field names. Keep the signal - *this actor searched for something outside their
caseload* - without keeping the string.

### B6 - S2. Share expiry is off by up to a day

`server/src/guard.ts:45`:

```sql
expires_at > datetime('now')
```

`expires_at` is written by `new Date().toISOString()` - `2026-11-03T20:17:49.329Z`.
`datetime('now')` returns `2026-11-03 20:17:49`. SQLite compares them as strings,
and `'T'` (0x54) sorts after `' '` (0x20), so **any share whose expiry date is
today compares as still valid for the whole of today**, whatever time it expired.

Demonstrated:

```
expires_at      = 2026-09-05T01:00:00.000Z   (expired at 01:00)
datetime('now') = 2026-09-05 23:00:00        (it is now 23:00)
expires_at > now -> true
```

The prosecutor persona is sold on *"sees exactly what was shared, for as long as it
was shared"*. It is up to 24 hours longer than that, and a same-day share never
expires at all.

**Fix.** Bind the comparison value from JavaScript (`expires_at > ?` with
`new Date().toISOString()`), or store epoch milliseconds. One line either way.

---

## C. The public and citizen surfaces

### C1 - S2. Nothing is rate limited

No `@fastify/rate-limit` anywhere. Consequences:

- **`POST /auth/login`** - unlimited password attempts, no lockout. `scrypt` makes
  each try expensive, which is a throttle by accident, not by design.
- **`POST /citizen/request-otp`** - returns 404 for an unknown reference and 200
  for a known one, so FIR reference numbers can be enumerated.
- **`POST /citizen/status`** - ~~a six-digit OTP, valid ten minutes, unlimited
  attempts~~. **Closed.** `citizen_tokens.otp_attempts` counts wrong guesses; the
  fifth failure cancels the code and returns `429 otp_locked`, so the complainant
  must request a new one and an attacker restarts from zero. The comparison is
  `timingSafeEqual`, and a correct code is spent on use rather than left live for
  its full ten minutes.

The OTP is also stored in plaintext in `citizen_tokens.otp`, and
`request-otp` returns `demoOtp` in the response body. Both are labelled as demo
affordances, and both would be findings in a real audit.

**Still open.** Rate limit globally; return an identical response for known and
unknown references; store the OTP hashed.

### C2 - S3. The verifier is a confirmation oracle

`GET /api/public/verify/:hash` will tell anyone, unlimited, whether a given digest
was anchored. That is the design and it is the right design - but it does mean
someone holding a leaked file can confirm it is the genuine sealed article. Worth
being able to answer, because a judge may ask.

**Fix.** Nothing, other than rate limiting it. The answer is that confirmation
requires already possessing the file, and integrity checking has to be open to the
other side or it is not worth anything.

---

## D. Platform hardening

| | Finding | Fix |
|---|---|---|
| **D1 - S2** | No `@fastify/helmet`. No CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`. The console is clickjackable and script-injectable | Register helmet with a CSP |
| **D2 - S2** | Session token lives in `localStorage` (`web/src/lib/api.ts:3`). With no CSP, one XSS is a full session theft | httpOnly `SameSite=Strict` cookie |
| **D3 - S2** | `corsOrigin: true` reflects **any** origin with `credentials: true` | Pin an allowlist |
| **D4 - S2** | `config.jwtSecret` falls back to `'pramana-demo-secret-do-not-use-in-production'` and the server boots happily | Refuse to start in production without `PRAMANA_JWT_SECRET` |
| **D5 - S2** | `PRAMANA_DEMO=off` is opt-**out**. A production deploy that forgets the variable ships a route that corrupts evidence on request | Make it opt-in: `PRAMANA_DEMO=on` |
| **D6 - S3** | `bodyLimit: 64 * 1024 * 1024` under a comment claiming "5 GB is the documented ceiling"; multipart allows 512 MB | Correct the comment or the number |
| **D7 - S3** | Tokens are bearer-only. `issueToken` promises "production adds mutual TLS and device binding on top" - nothing binds them today | Keep as a stated gap |

---

## E. Design loopholes a judge will find

### E1 - S1. Break-glass cannot open the one case it exists for

Evaluation is deny-overrides: every deny rule is tested before any permit. So
`deny-sensitive-case-without-assignment` fires before `permit-break-glass` can ever
be reached.

**Verified** against the shipped policy set:

```
Women Safety case, break-glass ON   ->  DENY / deny-sensitive-case-without-assignment
ordinary case,     break-glass ON   ->  PERMIT / permit-break-glass
above clearance,   break-glass ON   ->  DENY / deny-clearance-below-sensitivity
```

Break-glass only rescues `default-deny` on ordinary cases. The existing test passes
because it uses a non-sensitive document.

This matters because **Priority 2 in `PROJECT_BRIEF.md` is to build the break-glass
button on a denied case** - and the case a judge will try it on is the Women Safety
one, where it will do nothing. We would demonstrate our emergency path failing.

**Fix.** Make the deny rules break-glass aware by adding
`{ attr: 'environment.breakGlass', op: 'falsy' }` to the conditions of
`deny-sensitive-case-without-assignment`, `deny-out-of-district` and
`deny-clearance-below-sensitivity`. Leave `deny-sealed-cover-direct-read`
absolutely non-overridable - and say that out loud, because the contrast is the
point: *emergency access should be possible and uncomfortable; sealed cover should
be impossible.*

### E2 - S2. Purpose codes are self-asserted and never validated

`deny-missing-purpose` only checks that the value is truthy. The server never
checks membership in `PURPOSE_CODES`, and nothing binds the stated purpose to
anything observable. "Purpose limitation under the DPDP Act" currently means a
dropdown the officer picks from and could equally send as `"x"`.

**Fix.** Validate against `PURPOSE_CODES` and reject anything else. The honest
framing for the pitch is that the purpose is *attested and recorded*, not verified -
its force is that lying is on the record and feeds the anomaly score.

### E3 - S2. The case list does not scale, and it poisons the anomaly signal

`GET /api/cases` runs the policy engine, writes an audit event, and re-scores the
actor **once per case, per request**. With six cases that is invisible. The question
we will be asked is about 16,000 police stations.

It also means the audit log is mostly `via: case list` noise, which is the stream
UEBA baselines against.

**Fix.** Filter in SQL first, run the engine on the survivors, and write one
`case.list` audit event with a count rather than one per row.

### E4 - S2. Statutory citations are still unverified, and now they are on screen

Every citation carries `[VERIFY]`, and the dashboard renders them:
`BNSS s.173(1) proviso [VERIFY]`, `BNSS s.230 [VERIFY]`. `PROJECT_BRIEF.md` already
calls this the highest-risk outstanding item and it is still open.

A wrong section number in front of a judge from the Ministry of Home Affairs costs
more than the feature. Either clear the markers against indiacode.nic.in, or hide
the marker in the UI and keep it in the source - but do not project `[VERIFY]` onto
a screen in a government hall.

### E5 - S3. The emblem question

The State Emblem of India is protected by the State Emblem of India (Prohibition of
Improper Use) Act, 2005, and may not be used on a prototype that is not a government
publication. The new masthead therefore uses an original PRAMANA seal and the
interface carries a prototype band. This is worth mentioning in the pitch
unprompted - it reads as knowing the rules of the domain, which is the whole
posture of this project.

---

## F. What the problem statement still asks for

Not defects - unbuilt scope, in the order `PROJECT_BRIEF.md` ranks it.

| | Status |
|---|---|
| CCTNS / ICJS adapter with a mock IF-1..IF-5 source | Not built. Priority 1 in the brief, and the first question NCRB will ask |
| Break-glass in the officer console | Not built - and see **E1** before building it |
| Court bundle generator | Not built. The clearest operational win for a non-technical judge |
| Multi-node consortium demo | Not built |
| Offline / low-connectivity capture | Not built. The brief names adoption as the biggest real risk and offline as the requirement |
| GIGW 3.0 accessibility layer | **Built.** Text resize, high contrast, skip link, landmarks, statutory pages |
| Bilingual interface | **Built** for the chrome. Case content is deliberately never machine-translated |
| Legal citation verification | Open. See **E4** |

---

## Suggested order

1. **B1** - verify against the anchor. Ten lines; makes the headline claim true.
2. **A1, A2** - close the Women Safety overview and the simulator. Both contradict claims we make on stage.
3. **E1** - make break-glass reachable before building its button.
4. **A3** - `authorise()` on the remaining routes, plus the test that keeps them there.
5. **B6, B2** - share expiry and the recursive anchor guard. Small, and both are demonstrable bugs.
6. **C1, D1-D5** - rate limiting, helmet, cookie sessions, secret and demo-flag handling. This is the block an STQC auditor checks first.
7. **E4** - clear the `[VERIFY]` markers, or take them off the screen.
