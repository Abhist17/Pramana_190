import { run, get, now } from '../db/index.ts';
import { id } from '../core/ids.ts';
import { config } from '../config.ts';
import { LocalLedger } from './local.ts';
import { EvmLedger } from './evm.ts';
import { assertNoPersonalData } from './guard.ts';
import type { AnchorReceipt, AnchorRequest, LedgerDriver } from './types.ts';

export * from './types.ts';
export { OnChainDataError } from './guard.ts';

let driver: LedgerDriver | null = null;

export function ledger(): LedgerDriver {
  if (!driver) driver = config.ledgerDriver === 'evm' ? new EvmLedger() : new LocalLedger();
  return driver;
}

/**
 * Anchor a proof. Every write goes through the personal-data guard first — an
 * on-chain leak is permanent, so this check is not optional and not overridable.
 */
export async function anchor(request: AnchorRequest): Promise<AnchorReceipt> {
  assertNoPersonalData(request);
  const result = await ledger().submit(request);
  const anchorId = id('ANC');
  const createdAt = now();
  run(
    `INSERT INTO anchors (id, kind, subject_id, payload_hash, payload, driver, chain_id, tx_ref,
                          block_number, block_hash, contract, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    anchorId,
    request.kind,
    request.subjectId,
    result.payloadHash,
    JSON.stringify(request.payload),
    result.driver,
    result.chainId,
    result.txRef,
    result.blockNumber,
    result.blockHash,
    result.contract,
    createdAt,
  );
  return { anchorId, createdAt, ...result };
}

export function findAnchorByPayloadHash(payloadHash: string) {
  return get(
    'SELECT * FROM anchors WHERE payload_hash = ? ORDER BY created_at LIMIT 1',
    payloadHash,
  );
}

/** Backs the public verifier: is there an anchored document with this content hash? */
export function findDocumentAnchorByContentHash(contentHash: string) {
  return get(
    `SELECT a.* FROM anchors a
     WHERE a.kind = 'document' AND json_extract(a.payload, '$.documentHash') = ?
     ORDER BY a.created_at LIMIT 1`,
    contentHash,
  );
}
