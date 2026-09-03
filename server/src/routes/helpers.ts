import { get, json } from '../db/index.ts';
import type { Resource } from '../policy/engine.ts';

export type CaseRow = {
  id: string; case_number: string; title: string; station: string; district: string;
  sections: string; offence_category: string; sensitivity: number; sensitive_mode: number;
  status: string; registered_at: string; victim_pseudonym: string | null; created_by: string;
};

export function loadCase(caseId: string): CaseRow | undefined {
  return get<CaseRow>('SELECT * FROM cases WHERE id = ? OR case_number = ?', caseId, caseId);
}

export function caseResource(row: CaseRow): Resource {
  return {
    type: 'case', id: row.id, caseId: row.id, district: row.district, station: row.station,
    sensitivity: row.sensitivity, sensitiveMode: row.sensitive_mode === 1,
  };
}

export function documentResource(document: Record<string, unknown>, caseRow: CaseRow): Resource {
  return {
    type: 'document',
    id: String(document.id),
    caseId: String(document.case_id),
    district: caseRow.district,
    station: caseRow.station,
    sensitivity: Number(document.sensitivity),
    sensitiveMode: caseRow.sensitive_mode === 1,
    sealedCover: Number(document.sealed_cover) === 1,
    docClass: String(document.doc_class),
    docType: String(document.doc_type),
    ownerId: String(document.created_by),
    legalHold: Number(document.legal_hold) === 1,
  };
}

export function caseView(row: CaseRow) {
  return {
    id: row.id, caseNumber: row.case_number, title: row.title, station: row.station,
    district: row.district, sections: json<string[]>(row.sections, []),
    offenceCategory: row.offence_category, sensitivity: row.sensitivity,
    sensitiveMode: row.sensitive_mode === 1, status: row.status,
    registeredAt: row.registered_at, victimPseudonym: row.victim_pseudonym,
  };
}

export function documentView(row: Record<string, unknown>) {
  return {
    id: row.id, caseId: row.case_id, title: row.title, docClass: row.doc_class, docType: row.doc_type,
    sensitivity: row.sensitivity, language: row.language, mimeType: row.mime_type,
    sizeBytes: row.size_bytes, hash: { algorithm: row.hash_algorithm, value: row.hash_value },
    version: row.version, previousVersionId: row.previous_version_id, isCurrent: Number(row.is_current) === 1,
    changeNote: row.change_note, parentDocumentId: row.parent_document_id, renditionType: row.rendition_type,
    captureMeta: json<Record<string, unknown>>(row.capture_meta, {}), createdBy: row.created_by,
    createdAt: row.created_at, anchorId: row.anchor_id, retentionClass: row.retention_class,
    disposalDue: row.disposal_due, legalHold: Number(row.legal_hold) === 1,
    integrityStatus: row.integrity_status, sealedCover: Number(row.sealed_cover) === 1,
    signed: Boolean(row.signature),
  };
}

export const badRequest = (message: string) => ({ error: 'bad_request', message });
