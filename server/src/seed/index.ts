import { rmSync, mkdirSync, existsSync } from 'node:fs';
import { config } from '../config.ts';
import { db, run, get, all, now, closeDb } from '../db/index.ts';
import { hashPassword } from '../auth.ts';
import { generateKeypair, keyFingerprint } from '../core/signing.ts';
import { id } from '../core/ids.ts';
import { sealDocument } from '../services/documents.ts';
import { sealIdentity, enableSensitiveMode, assessSections } from '../services/wsd.ts';
import { createDeadlinesForCase } from '../services/deadlines.ts';
import { installPolicy, DEFAULT_POLICY } from '../policy/engine.ts';
import { sealBatch } from '../services/audit.ts';
import { recordCustody } from '../services/custody.ts';
import { sealUnderThreshold } from '../services/sealedCover.ts';
import { USERS, CASES } from './corpus.ts';

const reset = process.argv.includes('--reset');
const PASSWORD = 'pramana';

if (reset && existsSync(config.storageDir)) {
  console.log('· clearing existing storage');
  rmSync(config.storageDir, { recursive: true, force: true });
}
mkdirSync(config.storageDir, { recursive: true });

db();
if (get('SELECT id FROM users LIMIT 1') && !reset) {
  console.log('Database already seeded. Run `npm run reset` to rebuild from scratch.');
  process.exit(0);
}

console.log('\nPRAMANA — seeding demonstration corpus');
console.log('  All persons, cases and numbers below are fictional.\n');

// ------------------------------------------------------------------ users --
const userIds = new Map<string, string>();
for (const seed of USERS) {
  const keypair = generateKeypair();
  const { hash, salt } = hashPassword(PASSWORD);
  const userId = id('USR');
  run(
    `INSERT INTO users (id, username, password_hash, password_salt, full_name, designation, rank_level,
                        unit, district, station, is_woman_officer, clearance_level, role,
                        public_key, private_key, key_fingerprint, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId, seed.username, hash, salt, seed.fullName, seed.designation, seed.rankLevel,
    seed.unit, seed.district, seed.station, seed.isWomanOfficer ? 1 : 0, seed.clearanceLevel,
    seed.role, keypair.publicKey, keypair.privateKey, keyFingerprint(keypair.publicKey), now(),
  );
  userIds.set(seed.username, userId);
}
console.log(`  users            ${USERS.length}`);

// ----------------------------------------------------------------- policy --
const admin = userIds.get('d.security')!;
await installPolicy(DEFAULT_POLICY, admin);
console.log(`  policy           v${DEFAULT_POLICY.version}, ${DEFAULT_POLICY.rules.length} rules, hash anchored`);

// ------------------------------------------------------------------ cases --
let documentCount = 0;
const sealedForThreshold: { documentId: string; caseId: string }[] = [];

for (const seed of CASES) {
  const ioId = userIds.get(seed.io)!;
  const ioUser = get<{ private_key: string }>('SELECT private_key FROM users WHERE id = ?', ioId)!;
  const assessment = assessSections(seed.sections);
  const caseId = id('CASE');
  const registeredAt = new Date(Date.now() - seed.registeredDaysAgo * 86_400_000).toISOString();

  run(
    `INSERT INTO cases (id, case_number, title, station, district, sections, offence_category,
                        sensitivity, sensitive_mode, status, registered_at, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    caseId, seed.caseNumber, seed.title, seed.station, seed.district, JSON.stringify(seed.sections),
    assessment.category, assessment.sensitivity, assessment.sensitive ? 1 : 0, seed.status,
    registeredAt, ioId, registeredAt,
  );

  // The investigating officer, and the station SHO for non-sensitive cases.
  run('INSERT INTO case_assignments (case_id, user_id, role, assigned_by, assigned_at) VALUES (?,?,?,?,?)',
    caseId, ioId, 'io', ioId, registeredAt);
  const sho = USERS.find((u) => u.role === 'sho' && u.station === seed.station);
  if (sho) {
    run('INSERT INTO case_assignments (case_id, user_id, role, assigned_by, assigned_at) VALUES (?,?,?,?,?)',
      caseId, userIds.get(sho.username)!, 'supervisor', ioId, registeredAt);
  }
  // Co-investigators are normal, and the demo needs one account that can walk the
  // whole flow — capture, tamper, certificate, search — without switching users
  // mid-pitch. SI Deshmukh assists on the general Kalmeshwar case; the deliberate
  // denial in the demo is SI Pawar being refused the sensitive cases, which this
  // does not weaken.
  for (const co of seed.coInvestigators ?? []) {
    const coId = userIds.get(co);
    if (coId && coId !== ioId) {
      run('INSERT INTO case_assignments (case_id, user_id, role, assigned_by, assigned_at) VALUES (?,?,?,?,?)' +
          ' ON CONFLICT(case_id, user_id) DO NOTHING',
        caseId, coId, 'io', ioId, registeredAt);
    }
  }

  if (assessment.sensitive) enableSensitiveMode(caseId, ioId, `Auto-escalated on registration: ${assessment.matched.join('; ')}`);
  if (seed.victim) sealIdentity(caseId, seed.victim, seed.sections.some((s) => /POCSO/i.test(s)) ? 'victim' : 'victim');
  createDeadlinesForCase(caseId, assessment.category, registeredAt);

  run('INSERT INTO citizen_tokens (reference_no, case_id, phone) VALUES (?,?,?)',
    seed.caseNumber.replace(/\//g, '-'), caseId, seed.complainantPhone);

  for (const document of seed.documents) {
    const result = await sealDocument({
      caseId,
      title: document.title,
      docClass: document.docClass,
      docType: document.docType,
      sensitivity: document.sensitivity ?? assessment.sensitivity,
      language: document.language,
      mimeType: document.mimeType,
      content: Buffer.from(document.body, 'utf8'),
      createdBy: ioId,
      signerPrivateKey: ioUser.private_key,
      captureMeta: document.captureMeta ?? {
        source: document.handwritten ? 'scanner (backfile digitisation)' : 'web-console',
        capturedAt: registeredAt,
      },
      // Handwritten pages arrive through OCR, with the lower confidence that implies.
      sidecarText: document.handwritten ? document.body : undefined,
    });
    documentCount++;
    if (document.docType === 'fsl_report' || document.docType === 'cyber_forensics') {
      sealedForThreshold.push({ documentId: result.documentId, caseId });
    }
  }

  // Real files move between people: give the demo a custody chain worth showing.
  const fslDocument = get<{ id: string; hash_value: string }>(
    "SELECT id, hash_value FROM documents WHERE case_id = ? AND doc_type IN ('fsl_report','medical_report') LIMIT 1",
    caseId,
  );
  if (fslDocument) {
    await recordCustody({
      subjectType: 'document', subjectId: fslDocument.id, caseId, action: 'transfer',
      fromUser: ioId, toUser: userIds.get('k.mahajan')!,
      reason: 'Referred to the Regional FSL for examination',
      location: 'Regional Forensic Science Laboratory, Nagpur',
      itemHash: fslDocument.hash_value, signerPrivateKey: ioUser.private_key,
    });
  }

  // Physical exhibits ride the same ledger — this is the "asset lifecycle" answer.
  if (assessment.sensitive) {
    run(
      `INSERT INTO exhibits (id, case_id, label, description, tag_type, tag_id, location, seal_status, custodian_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id('EXH'), caseId, 'EX-1', 'Sealed sample packet forwarded to FSL', 'qr',
      `QR-${seed.caseNumber.replace(/\//g, '')}-1`, 'Malkhama rack B-14', 'intact',
      userIds.get('k.mahajan')!, registeredAt,
    );
  }
}
console.log(`  cases            ${CASES.length}`);
console.log(`  documents        ${documentCount} sealed + anchored`);

// -------------------------------------------------- sealed cover (level 4) --
const custodians = [userIds.get('j.registrar')!, userIds.get('m.iyer')!, userIds.get('n.banerjee')!];
if (sealedForThreshold[0]) {
  await sealUnderThreshold(sealedForThreshold[0].documentId, custodians, 2, userIds.get('m.iyer')!);
  console.log('  sealed cover     1 document under 2-of-3 threshold custody');
}

// ------------------------------------------------------------------ share --
// The prosecutor holds a scoped, expiring grant rather than blanket access.
const chargesheetCase = get<{ id: string }>("SELECT id FROM cases WHERE status = 'chargesheet_filed' LIMIT 1");
if (chargesheetCase) {
  run(
    `INSERT INTO shares (id, case_id, document_ids, grantee_id, purpose, granted_by, expires_at, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    id('SHA'), chargesheetCase.id, JSON.stringify([]), userIds.get('n.banerjee')!,
    'PROSECUTION', userIds.get('s.kulkarni')!,
    new Date(Date.now() + 60 * 86_400_000).toISOString(), now(),
  );
}

// ------------------------------------------------------------ audit batch --
const batch = await sealBatch();
console.log(`  audit            ${batch?.count ?? 0} events sealed into batch ${batch?.batchId ?? '—'}`);

const anchors = get<{ n: number }>('SELECT COUNT(*) AS n FROM anchors')!.n;
const blocks = get<{ n: number }>('SELECT COUNT(*) AS n FROM ledger_blocks')!.n;
console.log(`  ledger           ${anchors} anchors across ${blocks} blocks`);

const linked = all<{ normalised: string; n: number }>(
  `SELECT normalised, COUNT(DISTINCT case_id) AS n FROM entities
   WHERE type = 'phone' GROUP BY normalised HAVING n >= 2 ORDER BY n DESC`,
);
console.log(`  cross-case links ${linked.length} identifier(s) spanning multiple cases`);

if (reset) {
  // SQLite keeps an open handle to the file we just deleted, so a server that was
  // already running is now writing into a ghost inode.
  console.log('\n⚠  Storage was rebuilt. Restart the API (npm run dev) before using it.');
}

console.log('\nSign in at http://localhost:5173 — password for every persona is "pramana"');
console.log('  r.deshmukh  SI Rohini Deshmukh   woman officer, assigned to the sensitive cases');
console.log('  a.pawar     SI Amit Pawar        assigned only to the general cases');
console.log('  m.iyer      DSP Meera Iyer       district supervisor');
console.log('  n.banerjee  APP Nandita Banerjee prosecutor, scoped share only');
console.log('  d.security  CISO Divya Nair      audit trail, no case content\n');

closeDb();
