import { createHash } from 'node:crypto';
import { expand } from './lexicon.ts';

/**
 * Deterministic hashed n-gram embeddings with cross-lingual expansion.
 *
 * PRODUCTION: a self-hosted multilingual encoder (MuRIL / IndicBERT) produces
 * these vectors, on-premise, because no case content may reach a third-party API.
 *
 * HERE: a hashing vectoriser over word tokens and character trigrams, with every
 * token additionally hashed under its lexicon translations so that Hindi and
 * English forms of the same concept land in overlapping dimensions. It is a real
 * vector space with real cosine similarity — just a far weaker one than a trained
 * encoder. We label it as such everywhere it surfaces, and swapping it out is a
 * change to this one file.
 */

export const DIMS = 256;
export const MODEL_ID = 'pramana-hashed-ngram-v1 (placeholder for MuRIL/IndicBERT)';

/**
 * Indic scripts write vowels as combining marks (Unicode category M), so a
 * tokeniser that splits on "not a letter or number" shatters मैरून into म/र/न and
 * throws the word away. \p{M} must be part of the token class or every Devanagari
 * document silently indexes as noise — which is exactly the kind of bug that makes
 * a multilingual demo look like it works right up until a judge types in Hindi.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((token) => token.length > 1);
}

function bucket(term: string): number {
  return createHash('sha256').update(term).digest().readUInt32BE(0) % DIMS;
}

/**
 * Function words carry no retrieval signal but plenty of character trigrams, so
 * they drown the vector in generic similarity. Dropped from both halves.
 */
const STOPWORDS = new Set([
  'the', 'and', 'was', 'were', 'for', 'with', 'that', 'this', 'from', 'have', 'has',
  'not', 'are', 'his', 'her', 'him', 'she', 'they', 'them', 'their', 'which', 'who',
  'saw', 'near', 'into', 'onto', 'been', 'had', 'about', 'said', 'also', 'any',
  'के', 'का', 'की', 'को', 'में', 'से', 'पर', 'है', 'था', 'थी', 'थे', 'और', 'कि',
  'यह', 'वह', 'ने', 'एक', 'हुआ', 'गया', 'लिए', 'तथा', 'द्वारा',
]);

function trigrams(token: string): string[] {
  if (token.length < 3) return [token];
  const grams: string[] = [];
  for (let i = 0; i <= token.length - 3; i++) grams.push(token.slice(i, i + 3));
  return grams;
}

export function embed(text: string): Float32Array {
  const vector = new Float32Array(DIMS);
  const tokens = tokenize(text).filter((token) => !STOPWORDS.has(token));
  for (const token of tokens) {
    vector[bucket(token)]! += 1;
    // Cross-language: the translation contributes to the same vector, so a Hindi
    // document and its English query overlap even with no shared characters. It
    // is weighted at parity with the literal token — a translated match is just
    // as good a match.
    for (const translation of expand(token)) vector[bucket(translation)]! += 1;
    // Character trigrams give partial credit for morphological variants and OCR
    // slips. Kept deliberately small: trigrams of ordinary prose match almost
    // anything in the same script, and at any real weight they swamp the signal.
    for (const gram of trigrams(token)) vector[bucket(`#${gram}`)]! += 0.1;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIMS; i++) vector[i]! /= norm;
  return vector;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function toBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function fromBlob(blob: Uint8Array): Float32Array {
  const copy = Buffer.from(blob);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}
