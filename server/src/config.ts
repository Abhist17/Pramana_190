import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(SERVER_ROOT, '..');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '127.0.0.1',
  /** Demo secret. Production reads this from Vault / the platform secret store. */
  jwtSecret: process.env.PRAMANA_JWT_SECRET ?? 'pramana-demo-secret-do-not-use-in-production',
  tokenTtlSeconds: Number(process.env.PRAMANA_TOKEN_TTL ?? 3600),
  storageDir: process.env.PRAMANA_STORAGE ?? resolve(SERVER_ROOT, 'storage'),
  dbPath: process.env.PRAMANA_DB ?? resolve(SERVER_ROOT, 'storage', 'pramana.db'),
  /**
   * `local`  - embedded hash-linked consortium ledger with simulated validators.
   * `evm`    - permissioned EVM network (see contracts/). Set PRAMANA_RPC_URL.
   */
  ledgerDriver: (process.env.PRAMANA_LEDGER ?? 'local') as 'local' | 'evm',
  rpcUrl: process.env.PRAMANA_RPC_URL ?? 'http://127.0.0.1:8545',
  chainId: process.env.PRAMANA_CHAIN_ID ?? 'pramana-consortium-1',
  /** Audit events are Merkle-batched on this cadence, then one root is anchored. */
  auditBatchIntervalMs: Number(process.env.PRAMANA_AUDIT_BATCH_MS ?? 30_000),
  /** Sealed-cover and identity-vault requests must wait this long before they can be fulfilled. */
  sealWaitingPeriodMs: Number(process.env.PRAMANA_SEAL_WAIT_MS ?? 120_000),
  corsOrigin: process.env.PRAMANA_CORS ?? true,
};

/** Validators in the demo consortium. Real deployment = one node per institution. */
export const CONSORTIUM_VALIDATORS = [
  'NCRB',
  'STATE-CID',
  'JUDICIARY',
  'FSL',
  'PROSECUTION',
] as const;
