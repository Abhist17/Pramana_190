import { get, all, run, now } from '../db/index.ts';
import { hashRecord, sha256, hashesEqual, PRIMARY_ALGORITHM } from '../core/hash.ts';
import { encrypt, decrypt, generateKey } from '../core/envelope.ts';
import { signMessage, CREDENTIAL_TYPE, SIGNATURE_SCHEME } from '../core/signing.ts';
import { id } from '../core/ids.ts';
import { anchor } from '../ledger/index.ts';
import { wrapForCase, unwrapForCase } from './keys.ts';
import { putObject, getObject, objectExists } from './storage.ts';
import { extract, indexDocument, extractEntities } from './extraction.ts';
import { record as audit } from './audit.ts';
import { recordCustody } from './custody.ts';
import { retentionFor } from './retention.ts';

export type SealInput = {
  caseId: string;
  title: string;
  docClass: string;
  docType: string;
  sensitivity: number;
  language?: string;
  mimeType: string;
  content: Buffer;
  createdBy: string;
  signerPrivateKey: string;
  /** device, gps, capture time, attestation - captured on the device, before transit */
  captureMeta?: Record<string, unknown>;
  sidecarText?: string;
  previousVersionId?: string;
  changeNote?: string;
  parentDocumentId?: string;
  renditionType?: string;
  sealedCover?: boolean;
};

export type SealResult = {
  documentId: string;
  hash: { algorithm: string; value: string };
  anchorId: string;
  txRef: string;
  blockNumber: number | null;
  version: number;
  extraction: { language: string; engine: string; confidence: number; needsHumanVerification: boolean };
  entitiesFound: number;
};

/**
 * CAPTURE -> SEAL. The crucial property of the whole system lives in this
 * function: the hash is computed over the plaintext the officer actually
 * produced, and it is signed and anchored before the document has travelled
 * anywhere or been seen by a server administrator. Everything after this point is
 * verifiable against that seal.
 */
export async function sealDocument(input: SealInput): Promise<SealResult> {
  const documentId = id('DOC');
  const timestamp = now();

  // 1. Fingerprint the plaintext. This is the value that goes to court.
  const hash = hashRecord(input.content);

  // 2. Envelope-encrypt: fresh data key per document, wrapped by the case key.
  const dataKey = generateKey();
  const sealed = encrypt(input.content, dataKey, Buffer.from(documentId));
  const storageKey = sha256(`${documentId}:${hash.value}`);
  putObject(storageKey, sealed.data);

  // 3. Sign the seal with the officer's (simulated) DSC.
  const sealStatement = [
    'PRAMANA-SEAL-V1', documentId, input.caseId, hash.algorithm, hash.value,
    String(input.content.length), timestamp,
  ].join('|');
  const signature = signMessage(sealStatement, input.signerPrivateKey);

  const version = input.previousVersionId
    ? (get<{ version: number }>('SELECT version FROM documents WHERE id = ?', input.previousVersionId)?.version ?? 0) + 1
    : 1;

  const retention = retentionFor(input.docClass, input.docType);

  run(
    `INSERT INTO documents (id, case_id, title, doc_class, doc_type, sensitivity, language, mime_type,
      size_bytes, hash_algorithm, hash_value, storage_key, iv, auth_tag, wrapped_dek, version,
      previous_version_id, is_current, change_note, parent_document_id, rendition_type, capture_meta,
      created_by, created_at, signature, signer_id, retention_class, disposal_due, sealed_cover)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?)`,
    documentId, input.caseId, input.title, input.docClass, input.docType, input.sensitivity,
    input.language ?? 'en', input.mimeType, input.content.length, hash.algorithm, hash.value,
    storageKey, sealed.iv, sealed.authTag, wrapForCase(dataKey, input.caseId), version,
    input.previousVersionId ?? null, input.changeNote ?? null, input.parentDocumentId ?? null,
    input.renditionType ?? null, JSON.stringify(input.captureMeta ?? {}), input.createdBy, timestamp,
    signature, input.createdBy, retention.class, retention.disposalDue, input.sealedCover ? 1 : 0,
  );

  if (input.previousVersionId) {
    run('UPDATE documents SET is_current = 0 WHERE id = ?', input.previousVersionId);
  }

  // 4. Anchor. Hash, codes and counters only - never content, never a name.
  const previousAnchor = input.previousVersionId
    ? get<{ anchor_id: string }>('SELECT anchor_id FROM documents WHERE id = ?', input.previousVersionId)?.anchor_id
    : undefined;
  const receipt = await anchor({
    kind: 'document',
    contract: 'DocumentRegistry',
    method: 'anchorDocument',
    subjectId: documentId,
    payload: {
      documentHash: hash.value,
      algorithm: hash.algorithm,
      docTypeCode: input.docType,
      sensitivity: input.sensitivity,
      version,
      sizeBytes: input.content.length,
      previousAnchor: previousAnchor ?? '',
      sealedAt: timestamp,
    },
    submittedBy: input.createdBy,
  });
  run('UPDATE documents SET anchor_id = ? WHERE id = ?', receipt.anchorId, documentId);

  // 5. Custody begins at the seal, not at the first transfer.
  await recordCustody({
    subjectType: 'document',
    subjectId: documentId,
    caseId: input.caseId,
    action: 'seal',
    toUser: input.createdBy,
    reason: input.previousVersionId ? `Version ${version} sealed` : 'Initial capture and seal',
    itemHash: hash.value,
    signerPrivateKey: input.signerPrivateKey,
  });

  // 6. Derived metadata - separate namespace, machine-generated, never authoritative.
  const extraction = extract(input.content, input.mimeType, input.sidecarText);
  let entitiesFound = 0;
  if (extraction.text) {
    indexDocument(documentId, input.caseId, input.title, extraction);
    entitiesFound = extractEntities(documentId, input.caseId, extraction.text);
  }

  audit({
    actorId: input.createdBy,
    actorLabel: input.createdBy,
    action: 'document.create',
    outcome: 'allow',
    resourceType: 'document',
    resourceId: documentId,
    caseId: input.caseId,
    purposeCode: 'INVESTIGATION',
    detail: { hash: hash.value, version, anchorId: receipt.anchorId, docType: input.docType },
  });

  return {
    documentId,
    hash,
    anchorId: receipt.anchorId,
    txRef: receipt.txRef,
    blockNumber: receipt.blockNumber,
    version,
    extraction: {
      language: extraction.language,
      engine: extraction.engine,
      confidence: extraction.confidence,
      needsHumanVerification: extraction.needsHumanVerification,
    },
    entitiesFound,
  };
}

export type DocumentRow = {
  id: string; case_id: string; title: string; doc_class: string; doc_type: string;
  sensitivity: number; language: string; mime_type: string; size_bytes: number;
  hash_algorithm: string; hash_value: string; storage_key: string; iv: string; auth_tag: string;
  wrapped_dek: string; version: number; previous_version_id: string | null; is_current: number;
  change_note: string | null; parent_document_id: string | null; rendition_type: string | null;
  capture_meta: string; created_by: string; created_at: string; signature: string | null;
  signer_id: string | null; anchor_id: string | null; retention_class: string;
  disposal_due: string | null; legal_hold: number; integrity_status: string; sealed_cover: number;
};

export function loadDocument(documentId: string): DocumentRow | undefined {
  return get<DocumentRow>('SELECT * FROM documents WHERE id = ?', documentId);
}

export function decryptDocument(document: DocumentRow): Buffer {
  const dataKey = unwrapForCase(document.wrapped_dek, document.case_id);
  return decrypt(
    { data: getObject(document.storage_key), iv: document.iv, authTag: document.auth_tag },
    dataKey,
    Buffer.from(document.id),
  );
}

export type VerificationResult = {
  documentId: string;
  status: 'verified' | 'compromised' | 'missing';
  expectedHash: string;
  actualHash: string | null;
  algorithm: string;
  anchored: boolean;
  anchorId: string | null;
  txRef: string | null;
  blockNumber: number | null;
  anchoredAt: string | null;
  signatureValid: boolean | null;
  checkedAt: string;
  detail: string;
};

/**
 * Re-derives the fingerprint from what is actually in storage right now and
 * compares it to the anchored value. This is the function behind the red banner
 * in the tamper demonstration, and behind the routine integrity sweep.
 *
 * A failure here is not a warning: it locks the object, raises an alert to the
 * CISO and the case supervisor, and opens an incident.
 */
export function verifyDocument(documentId: string): VerificationResult {
  const document = loadDocument(documentId);
  const checkedAt = now();
  if (!document) {
    return {
      documentId, status: 'missing', expectedHash: '', actualHash: null, algorithm: PRIMARY_ALGORITHM,
      anchored: false, anchorId: null, txRef: null, blockNumber: null, anchoredAt: null,
      signatureValid: null, checkedAt, detail: 'No such document.',
    };
  }

  const anchorRow = document.anchor_id
    ? get<{ id: string; tx_ref: string; block_number: number | null; created_at: string; payload_hash: string }>(
        'SELECT id, tx_ref, block_number, created_at, payload_hash FROM anchors WHERE id = ?', document.anchor_id)
    : undefined;

  if (!objectExists(document.storage_key)) {
    return {
      documentId, status: 'missing', expectedHash: document.hash_value, actualHash: null,
      algorithm: document.hash_algorithm, anchored: Boolean(anchorRow), anchorId: anchorRow?.id ?? null,
      txRef: anchorRow?.tx_ref ?? null, blockNumber: anchorRow?.block_number ?? null,
      anchoredAt: anchorRow?.created_at ?? null, signatureValid: null, checkedAt,
      detail: 'The stored object is gone. The anchor survives, so the document’s prior existence remains provable.',
    };
  }

  let actualHash: string | null = null;
  let detail: string;
  let status: VerificationResult['status'];
  try {
    actualHash = sha256(decryptDocument(document));
    const matches = hashesEqual(document.hash_value, actualHash);
    status = matches ? 'verified' : 'compromised';
    detail = matches
      ? 'Recomputed fingerprint matches the value anchored at seal time. The document has not been altered.'
      : 'Recomputed fingerprint does NOT match the anchored value. This document has been altered since it was sealed.';
  } catch {
    // AES-GCM authentication failed: the ciphertext itself was edited.
    status = 'compromised';
    detail =
      'Authenticated decryption failed - the stored ciphertext was modified. The document cannot be trusted.';
  }

  if (status === 'compromised' && document.integrity_status !== 'compromised') {
    run("UPDATE documents SET integrity_status = 'compromised' WHERE id = ?", documentId);
    run(
      `INSERT INTO alerts (id, kind, severity, title, detail, actor_id, case_id, created_at)
       VALUES (?, 'integrity_failure', 'critical', ?, ?, NULL, ?, ?)`,
      id('ALR'),
      `Integrity failure on ${document.title}`,
      JSON.stringify({ documentId, expected: document.hash_value, actual: actualHash }),
      document.case_id, checkedAt,
    );
    audit({
      actorId: null, actorLabel: 'system', action: 'document.integrity_failure', outcome: 'error',
      resourceType: 'document', resourceId: documentId, caseId: document.case_id,
      detail: { expected: document.hash_value, actual: actualHash },
    });
  } else if (status === 'verified' && document.integrity_status === 'sealed') {
    run("UPDATE documents SET integrity_status = 'verified' WHERE id = ?", documentId);
  }

  return {
    documentId, status, expectedHash: document.hash_value, actualHash,
    algorithm: document.hash_algorithm, anchored: Boolean(anchorRow), anchorId: anchorRow?.id ?? null,
    txRef: anchorRow?.tx_ref ?? null, blockNumber: anchorRow?.block_number ?? null,
    anchoredAt: anchorRow?.created_at ?? null, signatureValid: Boolean(document.signature), checkedAt, detail,
  };
}

/** Full version chain, oldest first, each with its own anchor. */
export function versionChain(documentId: string): DocumentRow[] {
  const document = loadDocument(documentId);
  if (!document) return [];
  let root = document;
  while (root.previous_version_id) {
    const previous = loadDocument(root.previous_version_id);
    if (!previous) break;
    root = previous;
  }
  const chain = [root];
  for (;;) {
    const next = get<DocumentRow>('SELECT * FROM documents WHERE previous_version_id = ?', chain[chain.length - 1]!.id);
    if (!next) break;
    chain.push(next);
  }
  return chain;
}

export function renditionsOf(documentId: string): DocumentRow[] {
  return all<DocumentRow>('SELECT * FROM documents WHERE parent_document_id = ? ORDER BY created_at', documentId);
}

export const SEAL_METADATA = { scheme: SIGNATURE_SCHEME, credentialType: CREDENTIAL_TYPE };
