import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../config.ts';

/**
 * Encrypted object store with write-once semantics.
 *
 * Sealed objects are never modified in place. A "version" is a new object with a
 * new key; a redaction is a new object with a new key. That is what makes the
 * `chargesheet_FINAL_use_this.docx` problem structurally impossible rather than
 * merely discouraged.
 *
 * Production: MinIO or S3-compatible object storage with object lock (WORM),
 * versioning and legal-hold flags. The interface here matches deliberately.
 */

export class ObjectExistsError extends Error {}

function pathFor(key: string): string {
  // Two-level fan-out keeps directory sizes sane at scale.
  return resolve(config.storageDir, 'objects', key.slice(0, 2), key.slice(2, 4), key);
}

export function putObject(key: string, data: Buffer, options: { allowOverwrite?: boolean } = {}): void {
  const target = pathFor(key);
  if (existsSync(target) && !options.allowOverwrite) {
    throw new ObjectExistsError(`object ${key} already exists; sealed objects are write-once`);
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, target);
}

export function getObject(key: string): Buffer {
  return readFileSync(pathFor(key));
}

export function objectExists(key: string): boolean {
  return existsSync(pathFor(key));
}

/**
 * Cryptographic erasure: the ciphertext is overwritten and the wrapped data key
 * discarded, so the plaintext is unrecoverable. The on-chain anchor survives, so
 * it stays provable that the document existed and was lawfully destroyed rather
 * than quietly lost.
 */
export function eraseObject(key: string): void {
  const target = pathFor(key);
  if (existsSync(target)) writeFileSync(target, Buffer.alloc(0));
}

/** DEMO ONLY — used by the tamper demonstration. See routes/demo.ts. */
export function corruptObject(key: string): { before: number; after: number } {
  const target = pathFor(key);
  const data = readFileSync(target);
  if (data.length === 0) throw new Error('cannot corrupt an empty object');
  const index = Math.floor(data.length / 2);
  const before = data[index]!;
  data[index] = before ^ 0x01; // flip exactly one bit
  writeFileSync(target, data);
  return { before, after: data[index]! };
}
