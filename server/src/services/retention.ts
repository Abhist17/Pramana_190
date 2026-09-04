import { all, get, run, now } from '../db/index.ts';
import { hashObject } from '../core/hash.ts';
import { id } from '../core/ids.ts';
import { anchor } from '../ledger/index.ts';
import { eraseObject } from './storage.ts';
import { record as audit } from './audit.ts';

/**
 * Retention classes and disposal.
 *
 * Records are classified by retention class and must be preserved or destroyed on
 * schedule, with a record of destruction (Public Records Act 1993 and state
 * police manual schedules - the exact periods below are placeholders and are
 * flagged as such; a deployment loads the applicable state schedule).
 *
 * Disposal is cryptographic erasure plus a signed certificate of destruction. The
 * on-chain anchor survives, so it stays provable that the document existed and
 * was lawfully destroyed rather than quietly lost.
 */

export type RetentionClass = {
  id: string;
  label: string;
  years: number;
  /** true = never auto-propose disposal */
  permanent: boolean;
  note: string;
};

export const RETENTION_CLASSES: Record<string, RetentionClass> = {
  permanent: {
    id: 'permanent', label: 'Permanent preservation', years: 0, permanent: true,
    note: 'Judgments, capital and heinous-offence records, records of historical value.',
  },
  long: {
    id: 'long', label: 'Long term (30 years)', years: 30, permanent: false,
    note: 'Charge sheets, final reports, forensic and medical reports in grave offences.',
  },
  standard: {
    id: 'standard', label: 'Standard (10 years)', years: 10, permanent: false,
    note: 'Case diaries, statements, seizure and arrest memos.',
  },
  short: {
    id: 'short', label: 'Short term (3 years)', years: 3, permanent: false,
    note: 'Routine administrative correspondence and internal notes.',
  },
};

const CLASS_BY_TYPE: Record<string, string> = {
  judgment: 'permanent', final_report: 'long', chargesheet: 'long',
  fsl_report: 'long', medical_report: 'long', postmortem: 'permanent',
  fir: 'long', case_diary: 'standard', witness_statement: 'standard',
  victim_statement: 'long', seizure_memo: 'standard', arrest_memo: 'standard',
  site_plan: 'standard', scene_photograph: 'long', correspondence: 'short',
  handover_memo: 'short', notice: 'short',
};

export function retentionFor(docClass: string, docType: string): { class: string; disposalDue: string | null } {
  const retentionClass = CLASS_BY_TYPE[docType] ?? (docClass === 'administrative' ? 'short' : 'standard');
  const definition = RETENTION_CLASSES[retentionClass]!;
  if (definition.permanent) return { class: retentionClass, disposalDue: null };
  const due = new Date();
  due.setFullYear(due.getFullYear() + definition.years);
  return { class: retentionClass, disposalDue: due.toISOString() };
}

/** Documents whose retention period has expired and which no legal hold protects. */
export function disposalCandidates() {
  return all(
    `SELECT id, case_id, title, doc_type, retention_class, disposal_due, legal_hold
     FROM documents
     WHERE disposal_due IS NOT NULL AND disposal_due <= ? AND legal_hold = 0
       AND integrity_status != 'disposed'
     ORDER BY disposal_due`,
    now(),
  );
}

export function setLegalHold(caseId: string, on: boolean, actorId: string, reason: string) {
  run('UPDATE documents SET legal_hold = ? WHERE case_id = ?', on ? 1 : 0, caseId);
  audit({
    actorId, actorLabel: actorId, action: on ? 'retention.hold_applied' : 'retention.hold_lifted',
    outcome: 'allow', resourceType: 'case', resourceId: caseId, caseId, detail: { reason },
  });
  return { caseId, legalHold: on };
}

export async function disposeDocument(documentId: string, approvedBy: string, reason: string) {
  const document = get<{ id: string; case_id: string; storage_key: string; hash_value: string; retention_class: string; legal_hold: number; title: string }>(
    'SELECT id, case_id, storage_key, hash_value, retention_class, legal_hold, title FROM documents WHERE id = ?',
    documentId,
  );
  if (!document) throw new Error('document not found');
  if (document.legal_hold) throw new Error('document is under legal hold; disposal refused');

  eraseObject(document.storage_key);
  run("UPDATE documents SET integrity_status = 'disposed', wrapped_dek = '' WHERE id = ?", documentId);

  const certificate = {
    documentId, caseId: document.case_id, title: document.title,
    originalHash: document.hash_value, retentionClass: document.retention_class,
    method: 'cryptographic_erasure', approvedBy, reason, disposedAt: now(),
  };
  const certificateHash = hashObject(certificate);
  const recordId = id('DSP');
  run(
    `INSERT INTO disposal_records (id, document_id, case_id, retention_class, approved_by, method, certificate_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    recordId, documentId, document.case_id, document.retention_class, approvedBy,
    'cryptographic_erasure', certificateHash, now(),
  );
  const receipt = await anchor({
    kind: 'retention', contract: 'RetentionRegistry', method: 'recordDisposal',
    subjectId: recordId,
    payload: {
      originalHash: document.hash_value, certificateHash,
      retentionClass: document.retention_class, method: 'cryptographic_erasure', disposedAt: certificate.disposedAt,
    },
    submittedBy: approvedBy,
  });
  run('UPDATE disposal_records SET anchor_id = ? WHERE id = ?', receipt.anchorId, recordId);

  audit({
    actorId: approvedBy, actorLabel: approvedBy, action: 'document.dispose', outcome: 'allow',
    resourceType: 'document', resourceId: documentId, caseId: document.case_id,
    purposeCode: 'RECORDS', detail: { certificateHash, anchorId: receipt.anchorId },
  });

  return { recordId, certificate, certificateHash, anchorId: receipt.anchorId };
}
