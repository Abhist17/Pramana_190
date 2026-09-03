import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Three-tier envelope encryption.
 *
 *   document data key (DEK)  --wrapped by-->  case key (CK)  --wrapped by-->  master key (MK)
 *
 * Every document gets its own AES-256-GCM data key, so compromise of one key
 * exposes exactly one document. Case keys let us revoke or escrow a whole case.
 * In production the master key never leaves an HSM; in this demo it lives in a
 * file under `storage/keys/`, and we say so out loud rather than pretending
 * otherwise. See docs/ARCHITECTURE.md ("Demo vs production gaps").
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type SealedBlob = {
  /** ciphertext */
  data: Buffer;
  iv: string;
  authTag: string;
};

export type WrappedKey = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function encrypt(plaintext: Buffer, key: Buffer, aad?: Buffer): SealedBlob {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aad) cipher.setAAD(aad);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { data, iv: iv.toString('hex'), authTag: cipher.getAuthTag().toString('hex') };
}

export function decrypt(blob: SealedBlob, key: Buffer, aad?: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, 'hex'));
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'));
  return Buffer.concat([decipher.update(blob.data), decipher.final()]);
}

export function wrapKey(key: Buffer, wrappingKey: Buffer): WrappedKey {
  const sealed = encrypt(key, wrappingKey);
  return { ciphertext: sealed.data.toString('hex'), iv: sealed.iv, authTag: sealed.authTag };
}

export function unwrapKey(wrapped: WrappedKey, wrappingKey: Buffer): Buffer {
  return decrypt(
    { data: Buffer.from(wrapped.ciphertext, 'hex'), iv: wrapped.iv, authTag: wrapped.authTag },
    wrappingKey,
  );
}
