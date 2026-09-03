# Contributing

A hackathon repo with several people in it. These are working agreements, not bureaucracy.

## Getting set up

```bash
npm install
npm run seed
npm run dev
```

Node 22.5+ (24 recommended). No database server, no Docker, no native compilation — if `npm install`
asks for a C++ toolchain, something is wrong; say so rather than fighting it.

The `contracts/` package is **separate on purpose** so the main install stays fast. You only need it if
you are working on Solidity:

```bash
cd contracts && npm install && npx hardhat test
```

## Before you push

```bash
npm run typecheck   # strict, both workspaces
npm test            # 32 unit tests
```

Both must pass. CI runs them plus the contract tests on every push and PR.

## Who owns what

The split from the solution document, mapped onto directories:

| Role | Directories | Owns |
|---|---|---|
| **Blockchain** | `contracts/`, `server/src/ledger/` | Contracts, anchoring, Merkle batching, the EVM driver |
| **Backend / crypto** | `server/src/core/`, `server/src/services/` | Encryption, hashing, custody, signatures, storage, policy integration |
| **AI/ML** | `server/src/services/{extraction,embeddings,search,redaction,anomaly}.ts` | OCR pipeline, embeddings, hybrid search, redaction, anomaly detection |
| **Frontend** | `web/` | Officer console, case workspace, audit views, verifier |
| **Data & domain** | `server/src/seed/`, `docs/LEGAL_MAPPING.md`, `server/src/services/deadlines.ts` | The corpus, legal research, deadline rules, certificate format |
| **Pitch & integration** | `docs/DEMO_SCRIPT.md`, `docker-compose.yml`, CI | Demo script, slides, glue, rehearsal, judge Q&A |

**The data-and-domain role is the one teams forget, and the one that most determines whether the demo
feels real.** Assign it on day one.

## House rules

**Never commit real case data.** Everything in the corpus is fictional and must stay that way. If you
need a new scenario, add it to `server/src/seed/corpus.ts`.

**Mark unverified law `[VERIFY]`.** Section numbers in this repo are research leads until someone has
opened indiacode.nic.in and checked them. Adding a citation without the marker means the next person
assumes it was checked. See `docs/LEGAL_MAPPING.md`.

**Nothing personal goes on chain.** There is a guard that throws (`server/src/ledger/guard.ts`). If it
blocks you, it is right and your payload is wrong — anchor a hash instead. Do not weaken the guard.

**Access decisions go through the policy engine.** If you find yourself writing `if (user.role ===
'admin')` in a route, stop: add a rule to `server/src/policy/ruleset.ts` instead. Rules are data so a
legal change is an edit, not a release. Do not bypass a deny at a call site — if a legitimate action is
being refused, the action is modelled wrong (this happened once already; see `document.certify`).

**AI output is never authoritative.** Anything a model produces goes to the derived namespace with a
confidence score and a human-verification state, and it never modifies the sealed original.

**Keep the honesty markers.** `SIMULATED-DSC`, the demo-vs-production table in `docs/ARCHITECTURE.md`,
the "no real case data" line in the seed. Restraint reads as competence in a government-sponsored track;
a claim that does not survive a follow-up question costs more than the feature was worth.

## Scope discipline

`docs/SOLUTION.md` §16.1 has the ruthless scoping list. Read it before adding anything. If a feature is
not in the "must build" or "should build" lists, it is described in the pitch, not written in code.

**Freeze scope at hour six.**

## Commits and branches

Branch off `main`, one thing per branch, open a PR. Keep commit messages plain and factual — say what
changed and why, not how clever it was.
