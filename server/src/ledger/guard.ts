import type { AnchorRequest } from './types.ts';

/**
 * The single most important rule in the system: the chain stores proof, never
 * content. This guard runs on every anchor submission and throws rather than
 * letting a mistake become permanent — an on-chain leak cannot be deleted.
 *
 * We allow only hex digests, short codes, numbers and pseudonymous ids, and we
 * reject anything that pattern-matches Indian personal identifiers or free text
 * long enough to be a narrative.
 */

const FORBIDDEN_KEY = /(name|address|phone|mobile|aadhaar|aadhar|pan|email|narrative|summary|text|body|content|victim|accused|witness)/i;
const AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
const PHONE = /\b(?:\+?91[- ]?)?[6-9]\d{9}\b/;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const MAX_STRING_LENGTH = 128;

export class OnChainDataError extends Error {}

export function assertNoPersonalData(request: AnchorRequest): void {
  for (const [key, value] of Object.entries(request.payload)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw new OnChainDataError(
        `refusing to anchor field "${key}": field names suggesting personal data are not permitted on-chain`,
      );
    }
    if (typeof value !== 'string') continue;
    if (value.length > MAX_STRING_LENGTH) {
      throw new OnChainDataError(
        `refusing to anchor field "${key}": ${value.length} chars exceeds the ${MAX_STRING_LENGTH}-char on-chain limit (anchor a hash instead)`,
      );
    }
    for (const [label, pattern] of [
      ['Aadhaar-like number', AADHAAR],
      ['phone number', PHONE],
      ['PAN', PAN],
      ['email address', EMAIL],
    ] as const) {
      if (pattern.test(value)) {
        throw new OnChainDataError(`refusing to anchor field "${key}": value looks like a ${label}`);
      }
    }
  }
}
