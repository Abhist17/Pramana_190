/**
 * PII detection for redaction proposals.
 *
 * Two things matter here and both are stated in the pitch:
 *
 * 1. Redaction is TRUE redaction. The redacted rendition has the characters
 *    removed and replaced with a marker — it is not a black rectangle drawn over
 *    recoverable text. That failure is real and recurring in government document
 *    release, and this system does not reproduce it.
 * 2. Every proposal requires human confirmation before a redacted rendition is
 *    issued. The model proposes; a person decides.
 */

export type PiiMatch = {
  type: string;
  value: string;
  start: number;
  end: number;
  confidence: number;
};

const DETECTORS: { type: string; pattern: RegExp; confidence: number }[] = [
  { type: 'aadhaar', pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, confidence: 0.85 },
  { type: 'phone', pattern: /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, confidence: 0.95 },
  { type: 'pan', pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g, confidence: 0.9 },
  { type: 'email', pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g, confidence: 0.95 },
  { type: 'account', pattern: /\b\d{11,18}\b/g, confidence: 0.7 },
  { type: 'address', pattern: /\b(?:H\.?No\.?|House No\.?|मकान\s*नं\.?)\s*[\w\/-]+/gi, confidence: 0.75 },
  { type: 'pincode', pattern: /\b[1-9]\d{5}\b/g, confidence: 0.5 },
];

export function detectPii(text: string): PiiMatch[] {
  const matches: PiiMatch[] = [];
  for (const { type, pattern, confidence } of DETECTORS) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      matches.push({ type, value: match[0], start: match.index, end: match.index + match[0].length, confidence });
    }
  }
  // Overlapping detections: keep the most confident one for each span.
  matches.sort((a, b) => a.start - b.start || b.confidence - a.confidence);
  const kept: PiiMatch[] = [];
  for (const match of matches) {
    if (kept.some((k) => match.start < k.end && k.start < match.end)) continue;
    kept.push(match);
  }
  return kept;
}

/** Applies only the approved spans. Content is removed, never merely covered. */
export function applyRedactions(text: string, approved: PiiMatch[]): string {
  const ordered = [...approved].sort((a, b) => b.start - a.start);
  let output = text;
  for (const match of ordered) {
    output = `${output.slice(0, match.start)}[REDACTED:${match.type.toUpperCase()}]${output.slice(match.end)}`;
  }
  return output;
}

/** Replaces every occurrence of a protected name with its stable pseudonym. */
export function pseudonymise(text: string, realNames: string[], pseudonym: string): string {
  let output = text;
  for (const name of realNames.filter((n) => n.trim().length > 2)) {
    output = output.replaceAll(name, pseudonym);
    // Also catch the given name used alone, which is how leaks usually happen.
    for (const part of name.split(/\s+/).filter((p) => p.length > 3)) {
      output = output.replaceAll(part, pseudonym);
    }
  }
  return output;
}
