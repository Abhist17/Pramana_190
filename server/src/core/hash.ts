import { createHash } from 'node:crypto';

/**
 * SHA-256 is the primary anchor algorithm. The algorithm identifier travels with
 * every hash we store (see `HashRecord`) so that a future migration to a stronger
 * function is a planned re-anchoring operation rather than a crisis: old anchors
 * stay valid under their recorded algorithm.
 */
export const PRIMARY_ALGORITHM = 'SHA-256' as const;

export type HashRecord = {
  algorithm: string;
  /** lowercase hex, no 0x prefix */
  value: string;
};

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hashRecord(data: Buffer | string): HashRecord {
  return { algorithm: PRIMARY_ALGORITHM, value: sha256(data) };
}

/**
 * Deterministic hash of a structured object. Keys are sorted recursively so that
 * two semantically identical objects always produce the same digest regardless of
 * the order their fields happened to be constructed in. Used for audit events,
 * custody events and the access-policy set — anything whose hash must be
 * reproducible years later by someone re-serialising the same facts.
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`;
}

export function hashObject(value: unknown): string {
  return sha256(canonicalise(value));
}

/** Constant-time comparison for hex digests of equal length. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
