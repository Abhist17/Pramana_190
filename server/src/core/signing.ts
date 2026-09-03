import { generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey } from 'node:crypto';

/**
 * SIMULATED Class-3 Digital Signature Certificate.
 *
 * Officers in the field already carry CCA-licensed Class 3 DSC hardware tokens,
 * and production PRAMANA signs with those (or with Aadhaar eSign where a token is
 * impractical). We cannot issue real certificates for a hackathon, so we generate
 * an Ed25519 keypair per officer and label every signature it produces as
 * `SIMULATED-DSC` in the API, the UI and the evidence certificate itself.
 *
 * Being explicit about this is deliberate: an evidence certificate that quietly
 * implies a real CCA-backed signature would be worse than no certificate at all.
 */

export const SIGNATURE_SCHEME = 'Ed25519' as const;
export const CREDENTIAL_TYPE = 'SIMULATED-DSC' as const;

export type Keypair = { publicKey: string; privateKey: string };

export function generateKeypair(): Keypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function signMessage(message: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return sign(null, Buffer.from(message, 'utf8'), key).toString('hex');
}

export function verifySignature(message: string, signatureHex: string, publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

/** Short human-facing fingerprint of a public key, shown in the UI next to a signature. */
export function keyFingerprint(publicKeyPem: string): string {
  const body = publicKeyPem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const raw = Buffer.from(body, 'base64');
  return raw.subarray(-8).toString('hex').toUpperCase().match(/.{1,4}/g)!.join(':');
}
