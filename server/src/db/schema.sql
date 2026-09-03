-- PRAMANA schema.
-- SQLite for the demo; PostgreSQL + row-level security + pgvector in production
-- (see docs/ARCHITECTURE.md). Table shapes are deliberately portable.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- identity ---
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  password_salt    TEXT NOT NULL,
  full_name        TEXT NOT NULL,
  designation      TEXT NOT NULL,
  rank_level       INTEGER NOT NULL,          -- 1 constable .. 8 DGP; drives ABAC
  unit             TEXT NOT NULL,
  district         TEXT NOT NULL,
  station          TEXT,
  is_woman_officer INTEGER NOT NULL DEFAULT 0,
  clearance_level  INTEGER NOT NULL DEFAULT 2, -- max sensitivity readable
  role             TEXT NOT NULL,              -- io|sho|supervisor|prosecutor|fsl|court|records|ciso|admin|citizen
  public_key       TEXT NOT NULL,
  private_key      TEXT NOT NULL,              -- DEMO ONLY: production keys live on the DSC token
  key_fingerprint  TEXT NOT NULL,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL
);

-- ------------------------------------------------------------------- cases ---
CREATE TABLE IF NOT EXISTS cases (
  id                TEXT PRIMARY KEY,
  case_number       TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  station           TEXT NOT NULL,
  district          TEXT NOT NULL,
  sections          TEXT NOT NULL,             -- JSON array of statute references
  offence_category  TEXT NOT NULL,
  sensitivity       INTEGER NOT NULL DEFAULT 2,
  sensitive_mode    INTEGER NOT NULL DEFAULT 0, -- Women Safety Division mode
  status            TEXT NOT NULL DEFAULT 'under_investigation',
  registered_at     TEXT NOT NULL,
  victim_pseudonym  TEXT,
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_assignments (
  case_id     TEXT NOT NULL REFERENCES cases(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL,                   -- io|supervisor|prosecutor|fsl|court|observer
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (case_id, user_id)
);

CREATE TABLE IF NOT EXISTS case_keys (
  case_id     TEXT PRIMARY KEY REFERENCES cases(id),
  wrapped_key TEXT NOT NULL                    -- case key wrapped by the master key
);

-- --------------------------------------------------------------- documents ---
CREATE TABLE IF NOT EXISTS documents (
  id                  TEXT PRIMARY KEY,
  case_id             TEXT NOT NULL REFERENCES cases(id),
  title               TEXT NOT NULL,
  doc_class           TEXT NOT NULL,           -- registration|investigation|statement|evidence|forensic|prosecution|judicial|administrative
  doc_type            TEXT NOT NULL,           -- fir|case_diary|seizure_memo|witness_statement|...
  sensitivity         INTEGER NOT NULL,
  language            TEXT NOT NULL DEFAULT 'en',
  mime_type           TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  hash_algorithm      TEXT NOT NULL,
  hash_value          TEXT NOT NULL,
  storage_key         TEXT NOT NULL,
  iv                  TEXT NOT NULL,
  auth_tag            TEXT NOT NULL,
  wrapped_dek         TEXT NOT NULL,           -- data key wrapped by the case key
  version             INTEGER NOT NULL DEFAULT 1,
  previous_version_id TEXT REFERENCES documents(id),
  is_current          INTEGER NOT NULL DEFAULT 1,
  change_note         TEXT,
  -- Renditions (redacted / translated / OCR / PDF-A) point at their original.
  parent_document_id  TEXT REFERENCES documents(id),
  rendition_type      TEXT,
  capture_meta        TEXT NOT NULL DEFAULT '{}', -- device, gps, capture time, attestation
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          TEXT NOT NULL,
  signature           TEXT,
  signer_id           TEXT REFERENCES users(id),
  anchor_id           TEXT,
  retention_class     TEXT NOT NULL DEFAULT 'standard',
  disposal_due        TEXT,
  legal_hold          INTEGER NOT NULL DEFAULT 0,
  integrity_status    TEXT NOT NULL DEFAULT 'sealed', -- sealed|verified|compromised|disposed
  sealed_cover        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(hash_value);
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_document_id);

-- ----------------------------------------------------------------- custody ---
CREATE TABLE IF NOT EXISTS custody_events (
  id            TEXT PRIMARY KEY,
  subject_type  TEXT NOT NULL,                 -- document|exhibit
  subject_id    TEXT NOT NULL,
  case_id       TEXT NOT NULL REFERENCES cases(id),
  action        TEXT NOT NULL,                 -- seal|transfer|receive|handover|produce|return|dispose
  from_user     TEXT REFERENCES users(id),
  to_user       TEXT REFERENCES users(id),
  reason        TEXT NOT NULL,
  location      TEXT,
  item_hash     TEXT NOT NULL,
  released_sig  TEXT,
  received_sig  TEXT,
  previous_event TEXT REFERENCES custody_events(id),
  anchor_id     TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custody_subject ON custody_events(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS exhibits (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(id),
  label        TEXT NOT NULL,
  description  TEXT NOT NULL,
  tag_type     TEXT NOT NULL DEFAULT 'qr',
  tag_id       TEXT NOT NULL UNIQUE,
  location     TEXT NOT NULL,
  seal_status  TEXT NOT NULL DEFAULT 'intact',
  custodian_id TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL
);

-- ------------------------------------------------------------------- audit ---
CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  seq           INTEGER,
  ts            TEXT NOT NULL,
  actor_id      TEXT,
  actor_label   TEXT NOT NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  case_id       TEXT,
  purpose_code  TEXT,
  outcome       TEXT NOT NULL,                 -- allow|deny|error
  reason        TEXT,
  detail        TEXT NOT NULL DEFAULT '{}',
  ip            TEXT,
  leaf_hash     TEXT NOT NULL,
  batch_id      TEXT REFERENCES audit_batches(id)
);
CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_events(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_batch ON audit_events(batch_id);

CREATE TABLE IF NOT EXISTS audit_batches (
  id          TEXT PRIMARY KEY,
  root        TEXT NOT NULL,
  scope       TEXT NOT NULL,                   -- station or 'national'
  from_ts     TEXT NOT NULL,
  to_ts       TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  leaves      TEXT NOT NULL,                   -- JSON array, keeps proofs reconstructible
  anchor_id   TEXT,
  created_at  TEXT NOT NULL
);

-- -------------------------------------------------------------- blockchain ---
CREATE TABLE IF NOT EXISTS anchors (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,                  -- document|custody|audit_batch|policy|seal|retention
  subject_id   TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  driver       TEXT NOT NULL,                  -- local|evm
  chain_id     TEXT NOT NULL,
  tx_ref       TEXT NOT NULL,
  block_number INTEGER,
  block_hash   TEXT,
  contract     TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_anchors_payload ON anchors(payload_hash);
CREATE INDEX IF NOT EXISTS idx_anchors_subject ON anchors(subject_id);

-- Local consortium ledger: used when no EVM node is attached. Blocks are
-- hash-linked and every block carries attestations from the simulated validator
-- set (NCRB, State CID, Judiciary, FSL, Prosecution).
CREATE TABLE IF NOT EXISTS ledger_blocks (
  number       INTEGER PRIMARY KEY,
  prev_hash    TEXT NOT NULL,
  tx_root      TEXT NOT NULL,
  block_hash   TEXT NOT NULL,
  timestamp    TEXT NOT NULL,
  attestations TEXT NOT NULL                   -- JSON: validator -> signature
);

CREATE TABLE IF NOT EXISTS ledger_txs (
  id           TEXT PRIMARY KEY,
  block_number INTEGER NOT NULL REFERENCES ledger_blocks(number),
  contract     TEXT NOT NULL,
  method       TEXT NOT NULL,
  payload      TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- ------------------------------------------------------------------ policy ---
CREATE TABLE IF NOT EXISTS policies (
  id             TEXT PRIMARY KEY,
  version        INTEGER NOT NULL,
  rules          TEXT NOT NULL,
  policy_hash    TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to   TEXT,
  created_by     TEXT NOT NULL,
  anchor_id      TEXT,
  created_at     TEXT NOT NULL
);

-- ------------------------------------------------- victim identity vault ---
CREATE TABLE IF NOT EXISTS victim_vault (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  pseudonym   TEXT NOT NULL UNIQUE,
  subject_kind TEXT NOT NULL DEFAULT 'victim', -- victim|protected_witness|source
  ciphertext  TEXT NOT NULL,
  iv          TEXT NOT NULL,
  auth_tag    TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_requests (
  id           TEXT PRIMARY KEY,
  vault_id     TEXT NOT NULL REFERENCES victim_vault(id),
  case_id      TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES users(id),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|approved|denied|expired|fulfilled
  approvals    TEXT NOT NULL DEFAULT '[]',
  required_approvals INTEGER NOT NULL DEFAULT 2,
  requested_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  resolved_at  TEXT
);

-- --------------------------------------------------------- sealed cover ---
CREATE TABLE IF NOT EXISTS sealed_shares (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id),
  custodian_id TEXT NOT NULL REFERENCES users(id),
  share_index  INTEGER NOT NULL,
  share_value  TEXT NOT NULL,
  threshold    INTEGER NOT NULL,
  total_shares INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seal_requests (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  approvals    TEXT NOT NULL DEFAULT '[]',
  threshold    INTEGER NOT NULL,
  requested_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  anchor_id    TEXT
);

-- --------------------------------------------------------------- deadlines ---
CREATE TABLE IF NOT EXISTS deadlines (
  id               TEXT PRIMARY KEY,
  case_id          TEXT NOT NULL REFERENCES cases(id),
  kind             TEXT NOT NULL,
  statute_ref      TEXT NOT NULL,
  description      TEXT NOT NULL,
  starts_at        TEXT NOT NULL,
  due_at           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open', -- open|met|breached|waived
  escalation_level INTEGER NOT NULL DEFAULT 0,
  completed_at     TEXT,
  delay_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_deadlines_case ON deadlines(case_id);

-- ------------------------------------------------------------------ alerts ---
CREATE TABLE IF NOT EXISTS alerts (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  severity   TEXT NOT NULL,                    -- low|medium|high|critical
  title      TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '{}',
  actor_id   TEXT,
  case_id    TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  acked_by   TEXT,
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- entities ---
CREATE TABLE IF NOT EXISTS entities (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  document_id TEXT REFERENCES documents(id),
  type        TEXT NOT NULL,                   -- person|phone|vehicle|account|location|statute
  value       TEXT NOT NULL,
  normalised  TEXT NOT NULL,
  confidence  REAL NOT NULL DEFAULT 0.8,
  verified    INTEGER NOT NULL DEFAULT 0,      -- AI output is a proposal until a human confirms
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_norm ON entities(normalised);

-- ------------------------------------------------------------------ search ---
CREATE VIRTUAL TABLE IF NOT EXISTS document_text USING fts5(
  document_id UNINDEXED,
  case_id     UNINDEXED,
  title,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS embeddings (
  document_id TEXT PRIMARY KEY REFERENCES documents(id),
  dims        INTEGER NOT NULL,
  vector      BLOB NOT NULL,
  model       TEXT NOT NULL
);

-- Extracted text kept in its own namespace: AI output never touches the original.
CREATE TABLE IF NOT EXISTS derived_text (
  document_id  TEXT PRIMARY KEY REFERENCES documents(id),
  text         TEXT NOT NULL,
  language     TEXT NOT NULL,
  engine       TEXT NOT NULL,
  confidence   REAL NOT NULL,
  verified_by  TEXT,
  verified_at  TEXT,
  created_at   TEXT NOT NULL
);

-- ----------------------------------------------------------- certificates ---
CREATE TABLE IF NOT EXISTS certificates (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES documents(id),
  case_id      TEXT NOT NULL,
  payload      TEXT NOT NULL,
  pdf_path     TEXT NOT NULL,
  signatures   TEXT NOT NULL DEFAULT '[]',     -- dual signature: custodian + expert
  status       TEXT NOT NULL DEFAULT 'awaiting_signatures',
  generated_by TEXT NOT NULL REFERENCES users(id),
  anchor_id    TEXT,
  created_at   TEXT NOT NULL
);

-- --------------------------------------------------- citizen + disclosure ---
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(id),
  channel      TEXT NOT NULL,                  -- sms|email|digilocker
  recipient    TEXT NOT NULL,
  template     TEXT NOT NULL,
  body         TEXT NOT NULL,
  sent_at      TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  anchor_id    TEXT
);

CREATE TABLE IF NOT EXISTS citizen_tokens (
  reference_no TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES cases(id),
  phone        TEXT NOT NULL,
  otp          TEXT,
  otp_expires  TEXT
);

CREATE TABLE IF NOT EXISTS shares (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  document_ids TEXT NOT NULL,
  grantee_id  TEXT NOT NULL REFERENCES users(id),
  purpose     TEXT NOT NULL,
  granted_by  TEXT NOT NULL REFERENCES users(id),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS disposal_records (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL,
  case_id      TEXT NOT NULL,
  retention_class TEXT NOT NULL,
  approved_by  TEXT NOT NULL,
  method       TEXT NOT NULL DEFAULT 'cryptographic_erasure',
  certificate_hash TEXT NOT NULL,
  anchor_id    TEXT,
  created_at   TEXT NOT NULL
);
