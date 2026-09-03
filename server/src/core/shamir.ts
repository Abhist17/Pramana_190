import { randomBytes } from 'node:crypto';

/**
 * Shamir threshold secret sharing over GF(2^8), used for Level-4 "sealed cover"
 * material.
 *
 * A sealed document's data key is split into n shares held by designated
 * custodians (typically the case judge, the supervising officer and the head of
 * prosecution). Any m of them can reconstruct it; fewer learn nothing at all —
 * not "less information", literally nothing, which is the property that lets us
 * say no single individual, system administrator included, can decrypt a sealed
 * record.
 *
 * Combined with the enforced waiting period and all-custodian notification in
 * services/sealedCover.ts, an attacker who steals one credential cannot win.
 */

// Exp/log tables for GF(2^8) with the AES polynomial 0x11b, generator 0x03.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0);
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function gmul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

function gdiv(a: number, b: number): number {
  if (b === 0) throw new Error('division by zero in GF(256)');
  if (a === 0) return 0;
  return EXP[(LOG[a]! - LOG[b]! + 255) % 255]!;
}

export type Share = {
  /** x-coordinate, 1..255; never 0 because f(0) is the secret itself */
  index: number;
  /** hex-encoded y-coordinates, one byte per secret byte */
  value: string;
};

export function split(secret: Buffer, totalShares: number, threshold: number): Share[] {
  if (threshold < 2) throw new Error('threshold must be at least 2');
  if (totalShares < threshold) throw new Error('totalShares must be >= threshold');
  if (totalShares > 255) throw new Error('totalShares must be <= 255');

  const shares: Buffer[] = Array.from({ length: totalShares }, () => Buffer.alloc(secret.length));

  for (let byteIndex = 0; byteIndex < secret.length; byteIndex++) {
    // Random polynomial of degree threshold-1 whose constant term is the secret byte.
    const coefficients = [secret[byteIndex]!, ...randomBytes(threshold - 1)];
    for (let s = 0; s < totalShares; s++) {
      const x = s + 1;
      let y = 0;
      // Horner evaluation, highest coefficient first.
      for (let c = coefficients.length - 1; c >= 0; c--) y = gmul(y, x) ^ coefficients[c]!;
      shares[s]![byteIndex] = y;
    }
  }

  return shares.map((value, i) => ({ index: i + 1, value: value.toString('hex') }));
}

export function combine(shares: Share[]): Buffer {
  if (shares.length < 2) throw new Error('need at least two shares');
  const buffers = shares.map((s) => Buffer.from(s.value, 'hex'));
  const length = buffers[0]!.length;
  if (buffers.some((b) => b.length !== length)) throw new Error('shares have inconsistent length');

  const secret = Buffer.alloc(length);
  for (let byteIndex = 0; byteIndex < length; byteIndex++) {
    // Lagrange interpolation evaluated at x = 0.
    let accumulator = 0;
    for (let i = 0; i < shares.length; i++) {
      const xi = shares[i]!.index;
      const yi = buffers[i]![byteIndex]!;
      let basis = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        const xj = shares[j]!.index;
        basis = gmul(basis, gdiv(xj, xi ^ xj));
      }
      accumulator ^= gmul(yi, basis);
    }
    secret[byteIndex] = accumulator;
  }
  return secret;
}
