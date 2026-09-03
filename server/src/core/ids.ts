import { randomBytes, randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32, no I/L/O/U

/** Prefixed, sortable-ish, human-quotable identifier: DOC_01HQ8X... */
export function id(prefix: string): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % 32];
  return `${prefix}_${Date.now().toString(36).toUpperCase()}${out}`;
}

/**
 * Stable pseudonym for a protected person. This is what appears in every
 * document, index entry, search result, notification and export — the real name
 * lives only in the Victim Identity Vault.
 */
export function pseudonym(prefix = 'VICTIM'): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[randomInt(32)];
  return `${prefix}-${out}`;
}

export function otp(): string {
  return String(randomInt(100000, 1000000));
}
