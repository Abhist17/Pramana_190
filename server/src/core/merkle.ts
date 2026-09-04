import { createHash } from 'node:crypto';

/**
 * Merkle batching is what makes the audit log affordable on-chain.
 *
 * Writing one blockchain transaction per audit event does not scale: 16,000
 * police stations generating millions of reads, prints and downloads a day would
 * bury any ledger. Instead every event in a time window becomes a leaf, we anchor
 * only the root, and each individual event keeps a short inclusion proof. Any one
 * log line can then be proved authentic and un-backdated without the chain ever
 * carrying more than a handful of transactions per station per window.
 *
 * Domain separation (0x00 for leaves, 0x01 for internal nodes) prevents the
 * second-preimage attack where an internal node is replayed as a leaf.
 */

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

export type ProofStep = { hash: string; position: 'left' | 'right' };
export type InclusionProof = {
  leaf: string;
  leafIndex: number;
  root: string;
  treeSize: number;
  path: ProofStep[];
};

function sha256Hex(...parts: Buffer[]): string {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest('hex');
}

export function hashLeaf(payload: string): string {
  return sha256Hex(LEAF_PREFIX, Buffer.from(payload, 'utf8'));
}

function hashPair(left: string, right: string): string {
  return sha256Hex(NODE_PREFIX, Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

/** Builds every level of the tree, bottom-up. Odd nodes are promoted, not duplicated. */
function buildLevels(leaves: string[]): string[][] {
  if (leaves.length === 0) return [[]];
  const levels: string[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1];
      // A lone node is promoted unchanged rather than paired with itself, which
      // avoids the classic CVE-2012-2459 style duplicate-leaf root collision.
      next.push(right === undefined ? left : hashPair(left, right));
    }
    levels.push(next);
    current = next;
  }
  return levels;
}

export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return '0'.repeat(64);
  const levels = buildLevels(leaves);
  return levels[levels.length - 1]![0]!;
}

export function buildProof(leaves: string[], leafIndex: number): InclusionProof {
  if (leafIndex < 0 || leafIndex >= leaves.length) throw new Error('leaf index out of range');
  const levels = buildLevels(leaves);
  const path: ProofStep[] = [];
  let index = leafIndex;
  for (let level = 0; level < levels.length - 1; level++) {
    const nodes = levels[level]!;
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const sibling = nodes[siblingIndex];
    if (sibling !== undefined) {
      path.push({ hash: sibling, position: isRight ? 'left' : 'right' });
    }
    index = Math.floor(index / 2);
  }
  return {
    leaf: leaves[leafIndex]!,
    leafIndex,
    root: levels[levels.length - 1]![0]!,
    treeSize: leaves.length,
    path,
  };
}

/**
 * Verifies a proof standalone - no tree, no database, no server. This is the
 * function a defence counsel's own expert would re-implement to check our claim,
 * which is exactly why it stays this small.
 */
export function verifyProof(proof: InclusionProof): boolean {
  let computed = proof.leaf;
  for (const step of proof.path) {
    computed = step.position === 'left' ? hashPair(step.hash, computed) : hashPair(computed, step.hash);
  }
  return computed === proof.root;
}
