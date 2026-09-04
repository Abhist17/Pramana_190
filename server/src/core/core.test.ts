import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { merkleRoot, buildProof, verifyProof, hashLeaf } from './merkle.ts';
import { split, combine } from './shamir.ts';
import { encrypt, decrypt, generateKey, wrapKey, unwrapKey } from './envelope.ts';
import { generateKeypair, signMessage, verifySignature } from './signing.ts';
import { hashObject, canonicalise, sha256 } from './hash.ts';

describe('merkle', () => {
  const leaves = Array.from({ length: 23 }, (_, i) => hashLeaf(`event-${i}`));

  test('every leaf produces a proof that verifies against the root', () => {
    const root = merkleRoot(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = buildProof(leaves, i);
      assert.equal(proof.root, root);
      assert.ok(verifyProof(proof), `leaf ${i} failed`);
    }
  });

  test('a tampered leaf breaks its proof', () => {
    const proof = buildProof(leaves, 7);
    assert.ok(verifyProof(proof));
    assert.equal(verifyProof({ ...proof, leaf: hashLeaf('event-forged') }), false);
  });

  test('a tampered sibling breaks the proof', () => {
    const proof = buildProof(leaves, 3);
    const path = [...proof.path];
    path[0] = { ...path[0]!, hash: hashLeaf('forged-sibling') };
    assert.equal(verifyProof({ ...proof, path }), false);
  });

  test('changing any leaf changes the root', () => {
    const altered = [...leaves];
    altered[11] = hashLeaf('event-11-altered');
    assert.notEqual(merkleRoot(altered), merkleRoot(leaves));
  });

  test('promoting odd nodes avoids the duplicate-leaf root collision', () => {
    // A tree that duplicates its last leaf would give merkleRoot([a,b,c]) ===
    // merkleRoot([a,b,c,c]); promotion must not.
    const three = leaves.slice(0, 3);
    assert.notEqual(merkleRoot(three), merkleRoot([...three, three[2]!]));
  });

  test('single leaf and empty tree are well defined', () => {
    assert.equal(merkleRoot([leaves[0]!]), leaves[0]);
    assert.equal(merkleRoot([]), '0'.repeat(64));
  });
});

describe('shamir threshold sharing', () => {
  const secret = randomBytes(32);

  test('any threshold subset reconstructs the secret', () => {
    const shares = split(secret, 5, 3);
    const subsets = [[0, 1, 2], [0, 2, 4], [1, 3, 4], [2, 3, 4]];
    for (const subset of subsets) {
      assert.deepEqual(combine(subset.map((i) => shares[i]!)), secret);
    }
  });

  test('fewer than the threshold reveals nothing', () => {
    const shares = split(secret, 5, 3);
    const recovered = combine([shares[0]!, shares[1]!]);
    assert.notDeepEqual(recovered, secret);
  });

  test('2-of-3 works - the sealed-cover default', () => {
    const shares = split(secret, 3, 2);
    assert.deepEqual(combine([shares[0]!, shares[2]!]), secret);
  });

  test('rejects a threshold of one', () => {
    assert.throws(() => split(secret, 3, 1), /at least 2/);
  });
});

describe('envelope encryption', () => {
  test('round-trips through the full key hierarchy', () => {
    const master = generateKey();
    const caseKey = generateKey();
    const dataKey = generateKey();
    const wrappedCase = wrapKey(caseKey, master);
    const wrappedData = wrapKey(dataKey, caseKey);

    const plaintext = Buffer.from('FIR/2026/0142 - witness statement', 'utf8');
    const sealed = encrypt(plaintext, dataKey, Buffer.from('DOC_1'));

    const unwrappedCase = unwrapKey(wrappedCase, master);
    const unwrappedData = unwrapKey(wrappedData, unwrappedCase);
    assert.deepEqual(decrypt(sealed, unwrappedData, Buffer.from('DOC_1')), plaintext);
  });

  test('authenticated decryption rejects a modified ciphertext', () => {
    const key = generateKey();
    const sealed = encrypt(Buffer.from('sealed evidence'), key);
    sealed.data.writeUInt8(sealed.data.readUInt8(2) ^ 0x01, 2);
    assert.throws(() => decrypt(sealed, key));
  });

  test('associated data binds the ciphertext to its document id', () => {
    const key = generateKey();
    const sealed = encrypt(Buffer.from('sealed evidence'), key, Buffer.from('DOC_A'));
    assert.throws(() => decrypt(sealed, key, Buffer.from('DOC_B')));
  });

  test('the wrong key cannot decrypt', () => {
    const sealed = encrypt(Buffer.from('sealed evidence'), generateKey());
    assert.throws(() => decrypt(sealed, generateKey()));
  });
});

describe('signing', () => {
  test('a valid signature verifies and a forged one does not', () => {
    const keypair = generateKeypair();
    const statement = 'PRAMANA-SEAL-V1|DOC_1|CASE_1|SHA-256|abc|10|2026-01-01';
    const signature = signMessage(statement, keypair.privateKey);
    assert.ok(verifySignature(statement, signature, keypair.publicKey));
    assert.equal(verifySignature(`${statement}-altered`, signature, keypair.publicKey), false);
    assert.equal(verifySignature(statement, signature, generateKeypair().publicKey), false);
  });
});

describe('canonical hashing', () => {
  test('key order does not change the digest', () => {
    assert.equal(
      hashObject({ a: 1, b: { c: 2, d: 3 } }),
      hashObject({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  test('undefined fields are omitted, null is preserved', () => {
    assert.equal(canonicalise({ a: 1, b: undefined }), '{"a":1}');
    assert.equal(canonicalise({ a: 1, b: null }), '{"a":1,"b":null}');
  });

  test('a one-bit change gives a completely different digest', () => {
    const a = sha256(Buffer.from([0x00, 0x01]));
    const b = sha256(Buffer.from([0x00, 0x00]));
    assert.notEqual(a, b);
    const differing = [...a].filter((char, i) => char !== b[i]).length;
    assert.ok(differing > 40, `expected avalanche, only ${differing}/64 hex chars differed`);
  });
});
