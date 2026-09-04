import { all, get, run, now, json } from '../db/index.ts';
import { hashObject } from '../core/hash.ts';
import { hashLeaf, merkleRoot, buildProof, verifyProof, type InclusionProof } from '../core/merkle.ts';
import { id } from '../core/ids.ts';
import { anchor } from '../ledger/index.ts';
import { config } from '../config.ts';

/**
 * Append-only audit log, Merkle-batched and anchored.
 *
 * Every read, write, print, download, share, export, permission change, failed
 * authorisation *and search query* lands here - searching for a case you have no
 * connection to is itself a signal, so it is recorded like any other access.
 *
 * The log is designed to be produced in court, not merely read by an
 * administrator: each event carries a leaf hash, each batch has an anchored
 * Merkle root, and any single line can be proved authentic and un-backdated with
 * a proof short enough to print.
 */

export type AuditInput = {
  actorId: string | null;
  actorLabel: string;
  action: string;
  outcome: 'allow' | 'deny' | 'error';
  resourceType?: string | null;
  resourceId?: string | null;
  caseId?: string | null;
  purposeCode?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown>;
  ip?: string | null;
};

export function record(input: AuditInput): string {
  const eventId = id('AUD');
  const ts = now();
  // The leaf commits to the semantic content of the event, not to its row id, so
  // it stays verifiable even if the log is exported to a different store.
  const leafPayload = hashObject({
    id: eventId,
    ts,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    caseId: input.caseId ?? null,
    purposeCode: input.purposeCode ?? null,
    outcome: input.outcome,
    detail: input.detail ?? {},
  });
  const leaf = hashLeaf(leafPayload);

  run(
    `INSERT INTO audit_events (id, ts, actor_id, actor_label, action, resource_type, resource_id,
                               case_id, purpose_code, outcome, reason, detail, ip, leaf_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eventId, ts, input.actorId, input.actorLabel, input.action, input.resourceType ?? null,
    input.resourceId ?? null, input.caseId ?? null, input.purposeCode ?? null, input.outcome,
    input.reason ?? null, JSON.stringify(input.detail ?? {}), input.ip ?? null, leaf,
  );
  return eventId;
}

/**
 * Seals every unbatched event into one Merkle tree and anchors the root.
 * Millions of events collapse into a handful of transactions; each event keeps
 * an individually verifiable inclusion proof.
 */
export async function sealBatch(scope = 'national'): Promise<{ batchId: string; root: string; count: number } | null> {
  const pending = all<{ id: string; leaf_hash: string; ts: string }>(
    'SELECT id, leaf_hash, ts FROM audit_events WHERE batch_id IS NULL ORDER BY ts, id',
  );
  if (pending.length === 0) return null;

  const leaves = pending.map((event) => event.leaf_hash);
  const root = merkleRoot(leaves);
  const batchId = id('BAT');
  const createdAt = now();

  run(
    `INSERT INTO audit_batches (id, root, scope, from_ts, to_ts, event_count, leaves, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    batchId, root, scope, pending[0]!.ts, pending[pending.length - 1]!.ts,
    pending.length, JSON.stringify(leaves), createdAt,
  );
  for (const event of pending) run('UPDATE audit_events SET batch_id = ? WHERE id = ?', batchId, event.id);

  const receipt = await anchor({
    kind: 'audit_batch',
    contract: 'AuditAnchor',
    method: 'anchorBatch',
    subjectId: batchId,
    payload: { merkleRoot: root, eventCount: pending.length, scope, sealedAt: createdAt },
    submittedBy: 'system',
  });
  run('UPDATE audit_batches SET anchor_id = ? WHERE id = ?', receipt.anchorId, batchId);

  return { batchId, root, count: pending.length };
}

export type EventProof = {
  eventId: string;
  batchId: string;
  proof: InclusionProof;
  verified: boolean;
  anchor: Record<string, unknown> | null;
};

/** Produces the printable "this one line is genuine" proof for a single event. */
export function proofForEvent(eventId: string): EventProof | { error: string } {
  const event = get<{ id: string; leaf_hash: string; batch_id: string | null }>(
    'SELECT id, leaf_hash, batch_id FROM audit_events WHERE id = ?', eventId,
  );
  if (!event) return { error: 'event not found' };
  if (!event.batch_id) return { error: 'event is not yet sealed into a batch - it will be at the next batch interval' };

  const batch = get<{ id: string; leaves: string; anchor_id: string | null }>(
    'SELECT id, leaves, anchor_id FROM audit_batches WHERE id = ?', event.batch_id,
  );
  if (!batch) return { error: 'batch not found' };

  const leaves = json<string[]>(batch.leaves, []);
  const index = leaves.indexOf(event.leaf_hash);
  if (index === -1) return { error: 'leaf missing from its batch - integrity failure' };

  const proof = buildProof(leaves, index);
  return {
    eventId,
    batchId: batch.id,
    proof,
    verified: verifyProof(proof),
    anchor: batch.anchor_id
      ? (get('SELECT * FROM anchors WHERE id = ?', batch.anchor_id) as Record<string, unknown>) ?? null
      : null,
  };
}

let timer: NodeJS.Timeout | null = null;

export function startBatchScheduler(logger: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void }) {
  if (timer) return;
  timer = setInterval(() => {
    sealBatch()
      .then((result) => { if (result) logger.info({ ...result }, 'audit batch sealed and anchored'); })
      .catch((error) => logger.error({ err: String(error) }, 'audit batch failed'));
  }, config.auditBatchIntervalMs);
  timer.unref();
}

export function stopBatchScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
