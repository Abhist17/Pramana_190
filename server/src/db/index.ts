import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';

const here = dirname(fileURLToPath(import.meta.url));

export type Row = Record<string, unknown>;

let instance: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (!instance) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    instance = new DatabaseSync(config.dbPath);
    instance.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
    migrate(instance);
  }
  return instance;
}

/**
 * Columns added after a database was first created. `CREATE TABLE IF NOT EXISTS`
 * leaves an existing table untouched, so each addition needs an explicit,
 * idempotent ALTER.
 */
function migrate(handle: DatabaseSync): void {
  const columns = handle.prepare('PRAGMA table_info(citizen_tokens)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'otp_attempts')) {
    handle.exec('ALTER TABLE citizen_tokens ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0');
  }
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

type Param = string | number | bigint | null | Uint8Array;

function normalise(params: unknown[]): Param[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Uint8Array) return p;
    if (typeof p === 'number' || typeof p === 'bigint' || typeof p === 'string') return p;
    return JSON.stringify(p);
  });
}

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...normalise(params)) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...normalise(params)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): void {
  db().prepare(sql).run(...normalise(params));
}

export function tx<T>(fn: () => T): T {
  const handle = db();
  handle.exec('BEGIN');
  try {
    const result = fn();
    handle.exec('COMMIT');
    return result;
  } catch (error) {
    handle.exec('ROLLBACK');
    throw error;
  }
}

export const now = (): string => new Date().toISOString();

/** SQLite has no JSON column type; these keep the call sites honest. */
export function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
