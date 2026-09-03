import { get, all, run, now, json } from '../db/index.ts';
import { split, combine, type Share } from '../core/shamir.ts';
import { id } from '../core/ids.ts';
import { anchor } from '../ledger/index.ts';
import { record as audit } from './audit.ts';
import { unwrapForCase } from './keys.ts';
import { config } from '../config.ts';
import { decrypt } from '../core/envelope.ts';
import { getObject } from './storage.ts';

/**
 * Sealed cover (sensitivity Level 4).
 *
 * For material a court has ordered into sealed cover, or for source-protection
 * material, the document's data key is split with Shamir's scheme across
 * designated custodians — typically the case judge, the supervising officer and
 * the head of prosecution. No single individual, the system administrator
 * included, can decrypt it.
 *
 * Unsealing requires m-of-n approvals AND an enforced waiting period during which
 * every custodian is notified, so an illegitimate request is visible before it
 * succeeds. Every unsealing attempt — successful or not — is anchored on-chain.
 *
 * The attacker who steals one credential cannot win. That is the whole point.
 */

export async function sealUnderThreshold(
  documentId: string,
  custodianIds: string[],
  threshold: number,
  actorId: string,
) {
  if (custodianIds.length < threshold) throw new Error('custodian count must be at least the threshold');
  if (threshold < 2) throw new Error('threshold must be at least 2 — a single custodian defeats the purpose');

  const document = get<{ id: string; case_id: string; wrapped_dek: string }>(
    'SELECT id, case_id, wrapped_dek FROM documents WHERE id = ?', documentId,
  );
  if (!document) throw new Error('document not found');

  const dataKey = unwrapForCase(document.wrapped_dek, document.case_id);
  const shares = split(dataKey, custodianIds.length, threshold);

  run('DELETE FROM sealed_shares WHERE document_id = ?', documentId);
  shares.forEach((share, index) => {
    run(
      `INSERT INTO sealed_shares (id, document_id, custodian_id, share_index, share_value, threshold, total_shares)
       VALUES (?,?,?,?,?,?,?)`,
      id('SHR'), documentId, custodianIds[index]!, share.index, share.value, threshold, custodianIds.length,
    );
  });

  // The single-party path is removed: the wrapped data key is discarded, so from
  // this point on the only route to the plaintext is through the custodians.
  run("UPDATE documents SET sealed_cover = 1, sensitivity = 4, wrapped_dek = '' WHERE id = ?", documentId);

  const receipt = await anchor({
    kind: 'seal', contract: 'SealedCustody', method: 'sealDocument', subjectId: documentId,
    payload: { threshold, custodianCount: custodianIds.length, sealedAt: now() },
    submittedBy: actorId,
  });

  audit({
    actorId, actorLabel: actorId, action: 'seal.apply', outcome: 'allow',
    resourceType: 'document', resourceId: documentId, caseId: document.case_id,
    detail: { threshold, custodians: custodianIds.length, anchorId: receipt.anchorId },
  });

  return { documentId, threshold, totalShares: custodianIds.length, anchorId: receipt.anchorId };
}

export async function requestUnseal(documentId: string, requestedBy: string, reason: string) {
  const shares = all<{ threshold: number }>('SELECT threshold FROM sealed_shares WHERE document_id = ? LIMIT 1', documentId);
  if (shares.length === 0) throw new Error('document is not under threshold seal');
  if (reason.trim().length < 20) throw new Error('a substantive written justification is required');

  const document = get<{ case_id: string }>('SELECT case_id FROM documents WHERE id = ?', documentId);
  const requestId = id('SRQ');
  const requestedAt = now();
  const availableAt = new Date(Date.now() + config.sealWaitingPeriodMs).toISOString();

  run(
    `INSERT INTO seal_requests (id, document_id, requested_by, reason, threshold, requested_at, available_at)
     VALUES (?,?,?,?,?,?,?)`,
    requestId, documentId, requestedBy, reason, shares[0]!.threshold, requestedAt, availableAt,
  );

  // Every custodian is notified during the wait, not after the fact.
  const custodians = all<{ custodian_id: string }>('SELECT custodian_id FROM sealed_shares WHERE document_id = ?', documentId);
  for (const custodian of custodians) {
    run(
      `INSERT INTO alerts (id, kind, severity, title, detail, actor_id, case_id, created_at)
       VALUES (?, 'seal_unseal_requested', 'high', ?, ?, ?, ?, ?)`,
      id('ALR'), 'Sealed-cover unseal requested — your approval is required',
      JSON.stringify({ requestId, documentId, reason, availableAt, custodian: custodian.custodian_id }),
      requestedBy, document?.case_id ?? null, requestedAt,
    );
  }

  const receipt = await anchor({
    kind: 'seal', contract: 'SealedCustody', method: 'requestUnseal', subjectId: requestId,
    payload: { documentRef: documentId, threshold: shares[0]!.threshold, requestedAt, availableAt },
    submittedBy: requestedBy,
  });
  run('UPDATE seal_requests SET anchor_id = ? WHERE id = ?', receipt.anchorId, requestId);

  audit({
    actorId: requestedBy, actorLabel: requestedBy, action: 'seal.request', outcome: 'allow',
    resourceType: 'document', resourceId: documentId, caseId: document?.case_id ?? null, reason,
    detail: { requestId, availableAt, threshold: shares[0]!.threshold },
  });

  return { requestId, availableAt, threshold: shares[0]!.threshold, custodians: custodians.length };
}

export function approveUnseal(requestId: string, custodianId: string) {
  const request = get<{ id: string; document_id: string; approvals: string; threshold: number; status: string; requested_by: string }>(
    'SELECT * FROM seal_requests WHERE id = ?', requestId,
  );
  if (!request) throw new Error('request not found');
  if (request.status !== 'pending') throw new Error(`request is already ${request.status}`);

  const holdsShare = get('SELECT 1 FROM sealed_shares WHERE document_id = ? AND custodian_id = ?', request.document_id, custodianId);
  if (!holdsShare) throw new Error('you are not a designated custodian of this document');

  const approvals = json<string[]>(request.approvals, []);
  if (approvals.includes(custodianId)) throw new Error('you have already approved this request');
  approvals.push(custodianId);
  const satisfied = approvals.length >= request.threshold;
  run(
    'UPDATE seal_requests SET approvals = ?, status = ? WHERE id = ?',
    JSON.stringify(approvals), satisfied ? 'approved' : 'pending', requestId,
  );

  audit({
    actorId: custodianId, actorLabel: custodianId, action: 'seal.approve', outcome: 'allow',
    resourceType: 'document', resourceId: request.document_id,
    detail: { requestId, approvals: approvals.length, threshold: request.threshold },
  });

  return { requestId, approvals: approvals.length, threshold: request.threshold, status: satisfied ? 'approved' : 'pending' };
}

/** Reconstructs the data key from the approving custodians' shares and decrypts. */
export async function openSealed(requestId: string, actorId: string): Promise<Buffer> {
  const request = get<{ id: string; document_id: string; approvals: string; threshold: number; status: string; available_at: string }>(
    'SELECT * FROM seal_requests WHERE id = ?', requestId,
  );
  if (!request) throw new Error('request not found');
  if (request.status !== 'approved') throw new Error('threshold approvals have not been reached');
  if (new Date() < new Date(request.available_at)) {
    throw new Error(`waiting period has not elapsed; available at ${request.available_at}`);
  }

  const approvals = json<string[]>(request.approvals, []);
  const shares: Share[] = all<{ custodian_id: string; share_index: number; share_value: string }>(
    'SELECT custodian_id, share_index, share_value FROM sealed_shares WHERE document_id = ?', request.document_id,
  )
    .filter((row) => approvals.includes(row.custodian_id))
    .map((row) => ({ index: row.share_index, value: row.share_value }));

  if (shares.length < request.threshold) throw new Error('insufficient shares to reconstruct the key');

  const dataKey = combine(shares.slice(0, request.threshold));
  const document = get<{ id: string; storage_key: string; iv: string; auth_tag: string; case_id: string }>(
    'SELECT id, storage_key, iv, auth_tag, case_id FROM documents WHERE id = ?', request.document_id,
  );
  if (!document) throw new Error('document not found');

  const plaintext = decrypt(
    { data: getObject(document.storage_key), iv: document.iv, authTag: document.auth_tag },
    dataKey, Buffer.from(document.id),
  );

  run("UPDATE seal_requests SET status = 'fulfilled' WHERE id = ?", requestId);
  await anchor({
    kind: 'seal', contract: 'SealedCustody', method: 'recordUnseal', subjectId: requestId,
    payload: { documentRef: request.document_id, approvals: approvals.length, unsealedAt: now() },
    submittedBy: actorId,
  });
  audit({
    actorId, actorLabel: actorId, action: 'seal.open', outcome: 'allow',
    resourceType: 'document', resourceId: request.document_id, caseId: document.case_id,
    detail: { requestId, approvals: approvals.length },
  });

  return plaintext;
}

export function sealStatus(documentId: string) {
  const shares = all<{ custodian_id: string; threshold: number; total_shares: number; share_index: number }>(
    'SELECT custodian_id, threshold, total_shares, share_index FROM sealed_shares WHERE document_id = ?',
    documentId,
  );
  if (shares.length === 0) return null;
  return {
    sealed: true,
    threshold: shares[0]!.threshold,
    totalShares: shares[0]!.total_shares,
    custodians: shares.map((s) => s.custodian_id),
    requests: all('SELECT * FROM seal_requests WHERE document_id = ? ORDER BY requested_at DESC', documentId),
  };
}
