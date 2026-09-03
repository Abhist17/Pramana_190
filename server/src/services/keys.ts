import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.ts';
import { get, run } from '../db/index.ts';
import { generateKey, wrapKey, unwrapKey, type WrappedKey } from '../core/envelope.ts';

/**
 * Key hierarchy: document data key -> case key -> master key.
 *
 * DEMO GAP, STATED PLAINLY: the master key is a file on disk here. In production
 * it is generated inside and never leaves an HSM, with rotation, escrow for
 * sealed material, and a documented recovery ceremony. Everything above the
 * master key in this module is production-shaped; only its custody is not.
 */

const KEY_DIR = () => resolve(config.storageDir, 'keys');
const MASTER_PATH = () => resolve(KEY_DIR(), 'master.key');

let master: Buffer | null = null;

export function masterKey(): Buffer {
  if (master) return master;
  mkdirSync(KEY_DIR(), { recursive: true });
  if (!existsSync(MASTER_PATH())) {
    const fresh = generateKey();
    writeFileSync(MASTER_PATH(), fresh);
    chmodSync(MASTER_PATH(), 0o600);
  }
  master = readFileSync(MASTER_PATH());
  return master;
}

export function caseKey(caseId: string): Buffer {
  const row = get<{ wrapped_key: string }>('SELECT wrapped_key FROM case_keys WHERE case_id = ?', caseId);
  if (row) return unwrapKey(JSON.parse(row.wrapped_key) as WrappedKey, masterKey());
  const fresh = generateKey();
  run(
    'INSERT INTO case_keys (case_id, wrapped_key) VALUES (?, ?)',
    caseId,
    JSON.stringify(wrapKey(fresh, masterKey())),
  );
  return fresh;
}

export function wrapForCase(dataKey: Buffer, caseId: string): string {
  return JSON.stringify(wrapKey(dataKey, caseKey(caseId)));
}

export function unwrapForCase(wrapped: string, caseId: string): Buffer {
  return unwrapKey(JSON.parse(wrapped) as WrappedKey, caseKey(caseId));
}
