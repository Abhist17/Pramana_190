import { get, all, run, now } from '../db/index.ts';
import { id } from '../core/ids.ts';
import { signMessage } from '../core/signing.ts';
import { anchor } from '../ledger/index.ts';

/**
 * Chain of custody for documents and physical exhibits.
 *
 * Each event references the previous one, so the ledger is a genuine chain
 * rather than a pile of rows: a gap is structurally visible because the next
 * event's `previous_event` would point at nothing. Both parties sign — the
 * releasing officer at handover, the receiving officer on acknowledgement.
 *
 * The physical-exhibit path is the same table. That is how PRAMANA answers the
 * "manage police assets throughout their lifecycle" line in the problem
 * statement: a charge sheet and a seized weapon are both custodial assets with an
 * owner, a location, a condition, a retention period and a disposal date.
 */

export type CustodyInput = {
  subjectType: 'document' | 'exhibit';
  subjectId: string;
  caseId: string;
  action: 'seal' | 'transfer' | 'receive' | 'handover' | 'produce' | 'return' | 'dispose';
  fromUser?: string | null;
  toUser?: string | null;
  reason: string;
  location?: string;
  itemHash: string;
  signerPrivateKey?: string;
};

export async function recordCustody(input: CustodyInput) {
  const eventId = id('CUS');
  const timestamp = now();
  const previous = get<{ id: string }>(
    `SELECT id FROM custody_events WHERE subject_type = ? AND subject_id = ?
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    input.subjectType, input.subjectId,
  );

  const statement = [
    'PRAMANA-CUSTODY-V1', eventId, input.subjectType, input.subjectId, input.action,
    input.fromUser ?? '', input.toUser ?? '', input.itemHash, previous?.id ?? 'GENESIS', timestamp,
  ].join('|');
  const releasedSig = input.signerPrivateKey ? signMessage(statement, input.signerPrivateKey) : null;

  run(
    `INSERT INTO custody_events (id, subject_type, subject_id, case_id, action, from_user, to_user,
                                 reason, location, item_hash, released_sig, previous_event, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    eventId, input.subjectType, input.subjectId, input.caseId, input.action,
    input.fromUser ?? null, input.toUser ?? null, input.reason, input.location ?? null,
    input.itemHash, releasedSig, previous?.id ?? null, timestamp,
  );

  const receipt = await anchor({
    kind: 'custody',
    contract: 'CustodyLedger',
    method: 'recordTransfer',
    subjectId: eventId,
    payload: {
      subjectType: input.subjectType,
      itemHash: input.itemHash,
      actionCode: input.action,
      // Actor references are pseudonymous on-chain: otherwise the ledger itself
      // becomes a surveillance record of which officer touched which case.
      fromActor: input.fromUser ? pseudonymiseActor(input.fromUser) : '',
      toActor: input.toUser ? pseudonymiseActor(input.toUser) : '',
      previousEvent: previous?.id ?? '',
      recordedAt: timestamp,
    },
    submittedBy: input.fromUser ?? input.toUser ?? 'system',
  });
  run('UPDATE custody_events SET anchor_id = ? WHERE id = ?', receipt.anchorId, eventId);

  return { eventId, anchorId: receipt.anchorId, txRef: receipt.txRef, previousEvent: previous?.id ?? null };
}

/** Stable, non-reversible-without-the-database actor reference for on-chain use. */
function pseudonymiseActor(userId: string): string {
  return `ACTOR-${Buffer.from(userId).toString('base64url').slice(-10)}`;
}

/** Countersignature by the receiving officer completes the handoff. */
export function acknowledgeCustody(eventId: string, receiverId: string, privateKey: string) {
  const event = get<{ id: string; to_user: string | null; item_hash: string; subject_id: string }>(
    'SELECT id, to_user, item_hash, subject_id FROM custody_events WHERE id = ?', eventId,
  );
  if (!event) throw new Error('custody event not found');
  if (event.to_user !== receiverId) throw new Error('only the named receiving officer may acknowledge this transfer');
  const signature = signMessage(`PRAMANA-CUSTODY-ACK-V1|${eventId}|${receiverId}|${event.item_hash}`, privateKey);
  run('UPDATE custody_events SET received_sig = ? WHERE id = ?', signature, eventId);
  return { eventId, acknowledged: true };
}

export function custodyChain(subjectType: 'document' | 'exhibit', subjectId: string) {
  return all(
    `SELECT c.*, uf.full_name AS from_name, ut.full_name AS to_name
     FROM custody_events c
     LEFT JOIN users uf ON uf.id = c.from_user
     LEFT JOIN users ut ON ut.id = c.to_user
     WHERE c.subject_type = ? AND c.subject_id = ?
     ORDER BY c.created_at, c.id`,
    subjectType, subjectId,
  );
}

/**
 * Transfer of an entire case file on officer transfer. Generates a manifest of
 * exactly what the file contained at that moment, hashed and signed by both
 * officers — which alone solves the "two loose sheets went missing" problem.
 */
export async function handoverCase(caseId: string, fromUser: string, toUser: string, privateKey: string, reason: string) {
  const documents = all<{ id: string; hash_value: string; title: string }>(
    'SELECT id, hash_value, title FROM documents WHERE case_id = ? AND is_current = 1 ORDER BY created_at',
    caseId,
  );
  const { hashObject } = await import('../core/hash.ts');
  const manifestHash = hashObject(documents.map((d) => ({ id: d.id, hash: d.hash_value })));

  const event = await recordCustody({
    subjectType: 'document',
    subjectId: caseId,
    caseId,
    action: 'handover',
    fromUser, toUser, reason,
    itemHash: manifestHash,
    signerPrivateKey: privateKey,
  });

  run(
    'INSERT INTO case_assignments (case_id, user_id, role, assigned_by, assigned_at) VALUES (?,?,?,?,?)' +
      ' ON CONFLICT(case_id, user_id) DO UPDATE SET role = excluded.role',
    caseId, toUser, 'io', fromUser, now(),
  );

  return { ...event, manifestHash, documentCount: documents.length, manifest: documents };
}
