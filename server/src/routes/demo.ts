import type { FastifyInstance } from 'fastify';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { get, run, now } from '../db/index.ts';
import { authenticate } from '../guard.ts';
import { config } from '../config.ts';
import { corruptObject } from '../services/storage.ts';
import { verifyDocument, loadDocument } from '../services/documents.ts';
import { hashObject } from '../core/hash.ts';
import { id } from '../core/ids.ts';
import { record as audit } from '../services/audit.ts';
import { anchor } from '../ledger/index.ts';
import { badRequest } from './helpers.ts';

/**
 * Demonstration endpoints. Clearly separated, clearly labelled, and disabled by
 * setting PRAMANA_DEMO=off - a production deployment must not carry a route that
 * deliberately corrupts storage.
 *
 * The tamper demo is the single most persuasive thirty seconds in the pitch, so
 * it is built to be rehearsed: the original ciphertext is backed up before it is
 * corrupted, and /restore puts it back. Run it eight times before the judges see it.
 */
export default async function demoRoutes(app: FastifyInstance) {
  if (process.env.PRAMANA_DEMO === 'off') return;

  app.addHook('preHandler', async (request, reply) => { authenticate(request, reply); });

  const objectPath = (key: string) =>
    resolve(config.storageDir, 'objects', key.slice(0, 2), key.slice(2, 4), key);
  const backupPath = (key: string) => `${objectPath(key)}.demo-backup`;

  /**
   * Flips exactly one bit in the stored object - the digital equivalent of
   * changing a single pixel in a photograph. Then run /verify and watch it fail.
   */
  app.post('/tamper/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });

    const before = verifyDocument(documentId);
    if (!existsSync(backupPath(document.storage_key))) {
      copyFileSync(objectPath(document.storage_key), backupPath(document.storage_key));
    }
    const change = corruptObject(document.storage_key);
    const after = verifyDocument(documentId);

    audit({
      actorId: request.user!.id, actorLabel: request.user!.full_name, action: 'demo.tamper',
      outcome: 'allow', resourceType: 'document', resourceId: documentId, caseId: document.case_id,
      detail: { note: 'DEMONSTRATION: one bit flipped in the stored object', change },
    });

    return {
      documentId,
      title: document.title,
      bitFlipped: { byteBefore: change.before, byteAfter: change.after },
      before: { status: before.status, hash: before.actualHash },
      after: { status: after.status, hash: after.actualHash, detail: after.detail },
      anchoredHash: document.hash_value,
      message:
        'One bit changed. The anchored fingerprint on the ledger did not, and cannot. The document is now provably altered.',
    };
  });

  app.post('/restore/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    if (!existsSync(backupPath(document.storage_key))) {
      return reply.code(409).send(badRequest('no demo backup exists for this document'));
    }
    copyFileSync(backupPath(document.storage_key), objectPath(document.storage_key));
    run("UPDATE documents SET integrity_status = 'sealed' WHERE id = ?", documentId);
    run(
      "UPDATE alerts SET status = 'acknowledged', acked_by = ? WHERE kind = 'integrity_failure' AND status = 'open'",
      request.user!.id,
    );
    return { documentId, restored: true, verification: verifyDocument(documentId) };
  });

  /**
   * Sends the statutory 90-day progress intimation and records a delivery
   * receipt - the proof that the obligation was actually discharged.
   */
  app.post('/notify/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const { channel, template } = (request.body ?? {}) as { channel?: string; template?: string };
    const caseRow = get<{ id: string; case_number: string; status: string }>(
      'SELECT id, case_number, status FROM cases WHERE id = ? OR case_number = ?', caseId, caseId,
    );
    if (!caseRow) return reply.code(404).send({ error: 'not_found' });
    const token = get<{ phone: string }>('SELECT phone FROM citizen_tokens WHERE case_id = ?', caseRow.id);

    const body =
      template ??
      `Progress update for case ${caseRow.case_number}: the investigation is at stage "${caseRow.status}". ` +
        'This intimation is issued under the statutory 90-day obligation. Check details on the citizen portal.';
    const sentAt = now();
    const receiptHash = hashObject({ caseId: caseRow.id, body, sentAt, channel: channel ?? 'sms' });
    const notificationId = id('NOT');

    run(
      `INSERT INTO notifications (id, case_id, channel, recipient, template, body, sent_at, receipt_hash)
       VALUES (?,?,?,?,?,?,?,?)`,
      notificationId, caseRow.id, channel ?? 'sms', token?.phone ?? 'unknown',
      'progress_intimation_90d', body, sentAt, receiptHash,
    );
    // The receipt is anchored: the obligation is not just performed, it is provable.
    const receipt = await anchor({
      kind: 'document', contract: 'DocumentRegistry', method: 'anchorNotice',
      subjectId: notificationId,
      payload: { receiptHash, channel: channel ?? 'sms', template: 'progress_intimation_90d', sentAt },
      submittedBy: request.user!.id,
    });
    run('UPDATE notifications SET anchor_id = ? WHERE id = ?', receipt.anchorId, notificationId);

    audit({
      actorId: request.user!.id, actorLabel: request.user!.full_name, action: 'notification.send',
      outcome: 'allow', resourceType: 'case', resourceId: caseRow.id, caseId: caseRow.id,
      purposeCode: 'DISCLOSURE', detail: { notificationId, receiptHash, channel: channel ?? 'sms' },
    });

    return {
      notificationId, receiptHash, sentAt, channel: channel ?? 'sms',
      anchorId: receipt.anchorId,
      message: 'Statutory intimation sent. The delivery receipt is anchored, so discharge of the obligation is provable.',
    };
  });

  /** Resets demo state (alerts and tamper backups) between rehearsals. */
  app.post('/reset-alerts', async (request) => {
    run("UPDATE alerts SET status = 'acknowledged', acked_by = ? WHERE status = 'open'", request.user!.id);
    return { message: 'All open alerts acknowledged.' };
  });
}
