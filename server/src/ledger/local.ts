import { all, get, run, now } from '../db/index.ts';
import { hashObject, sha256 } from '../core/hash.ts';
import { merkleRoot, hashLeaf } from '../core/merkle.ts';
import { generateKeypair, signMessage, type Keypair } from '../core/signing.ts';
import { id } from '../core/ids.ts';
import { CONSORTIUM_VALIDATORS, config } from '../config.ts';
import type { AnchorRequest, LedgerDriver } from './types.ts';

/**
 * Embedded consortium ledger - the zero-setup default.
 *
 * This is not "a database pretending to be a blockchain". It reproduces the
 * properties we actually rely on: blocks are hash-linked so history cannot be
 * rewritten without rewriting everything after it, and each block carries
 * detached signatures from a validator set standing in for the five institutions
 * that would run real nodes (NCRB, State CID, Judiciary, FSL, Prosecution).
 *
 * What it does NOT reproduce is the thing that makes the real design credible:
 * those validators are independent organisations here only in name, since all
 * five keys live in one process. Run against the permissioned EVM network in
 * contracts/ (PRAMANA_LEDGER=evm) for the genuine article. We say this plainly
 * in the UI too - the ledger status panel labels itself.
 */

const GENESIS_HASH = '0'.repeat(64);
const validatorKeys = new Map<string, Keypair>();

function validators(): Map<string, Keypair> {
  if (validatorKeys.size === 0) {
    for (const name of CONSORTIUM_VALIDATORS) validatorKeys.set(name, generateKeypair());
  }
  return validatorKeys;
}

function head(): { number: number; block_hash: string } {
  const row = get<{ number: number; block_hash: string }>(
    'SELECT number, block_hash FROM ledger_blocks ORDER BY number DESC LIMIT 1',
  );
  return row ?? { number: -1, block_hash: GENESIS_HASH };
}

export class LocalLedger implements LedgerDriver {
  readonly name = 'local' as const;
  readonly chainId = config.chainId;

  async submit(request: AnchorRequest) {
    const payloadHash = hashObject(request.payload);
    const txId = id('TX');
    const previous = head();
    const blockNumber = previous.number + 1;
    const timestamp = now();

    // One transaction per block keeps the demo legible; a real QBFT network
    // batches many transactions into each block at ~2s intervals.
    const txRoot = merkleRoot([hashLeaf(payloadHash)]);
    const blockHash = sha256(
      [blockNumber, previous.block_hash, txRoot, timestamp].join('|'),
    );

    // Byzantine-fault-tolerant consensus needs 2f+1 of 3f+1; with 5 validators
    // that is 4. We collect all five and record them.
    const attestations: Record<string, string> = {};
    for (const [name, keypair] of validators()) {
      attestations[name] = signMessage(blockHash, keypair.privateKey).slice(0, 64);
    }

    run(
      `INSERT INTO ledger_blocks (number, prev_hash, tx_root, block_hash, timestamp, attestations)
       VALUES (?, ?, ?, ?, ?, ?)`,
      blockNumber,
      previous.block_hash,
      txRoot,
      blockHash,
      timestamp,
      JSON.stringify(attestations),
    );
    run(
      `INSERT INTO ledger_txs (id, block_number, contract, method, payload, payload_hash, submitted_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      txId,
      blockNumber,
      request.contract,
      request.method,
      JSON.stringify(request.payload),
      payloadHash,
      request.submittedBy,
      timestamp,
    );

    return {
      driver: this.name,
      chainId: this.chainId,
      txRef: txId,
      blockNumber,
      blockHash,
      contract: request.contract,
      payloadHash,
    };
  }

  async lookup(payloadHash: string) {
    const row = get<{ id: string; block_number: number }>(
      'SELECT id, block_number FROM ledger_txs WHERE payload_hash = ? ORDER BY block_number LIMIT 1',
      payloadHash,
    );
    return row ? { found: true, txRef: row.id, blockNumber: row.block_number } : { found: false };
  }

  /** Walks the whole chain re-deriving each link. Surfaced at GET /api/ledger/status. */
  async status() {
    const blocks = all<{ number: number; prev_hash: string; block_hash: string; tx_root: string; timestamp: string }>(
      'SELECT number, prev_hash, block_hash, tx_root, timestamp FROM ledger_blocks ORDER BY number',
    );
    let intact = true;
    let brokenAt: number | null = null;
    let expectedPrev = GENESIS_HASH;
    for (const block of blocks) {
      const recomputed = sha256([block.number, expectedPrev, block.tx_root, block.timestamp].join('|'));
      if (block.prev_hash !== expectedPrev || recomputed !== block.block_hash) {
        intact = false;
        brokenAt = block.number;
        break;
      }
      expectedPrev = block.block_hash;
    }
    return {
      driver: this.name,
      chainId: this.chainId,
      height: blocks.length,
      headHash: head().block_hash,
      chainIntact: intact,
      brokenAtBlock: brokenAt,
      validators: [...validators().keys()],
      consensus: 'QBFT (simulated, 5 validators, 4-of-5 quorum)',
      note: 'Embedded demo ledger. All validator keys live in this process; set PRAMANA_LEDGER=evm to anchor to the permissioned EVM network in contracts/.',
    };
  }
}
