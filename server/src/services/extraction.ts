import { all, run, now } from '../db/index.ts';
import { embed, toBlob, DIMS, MODEL_ID, tokenize } from './embeddings.ts';
import { id } from '../core/ids.ts';

/**
 * Text extraction and derived metadata.
 *
 * Everything this module produces is written to a derived namespace
 * (`derived_text`, `embeddings`, `entities`) and is marked machine-generated with
 * a confidence score and a human-verification state. It never touches the sealed
 * original. AI output is an index and a proposal - never evidence.
 */

export type ExtractionResult = {
  text: string;
  language: string;
  engine: string;
  confidence: number;
  needsHumanVerification: boolean;
};

const DEVANAGARI = /[ऀ-ॿ]/;

export function detectLanguage(text: string): string {
  const devanagariCount = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  if (devanagariCount > latinCount) return 'hi';
  if (devanagariCount > 0 && latinCount > 0) return 'mixed';
  return 'en';
}

/**
 * Real deployments run Tesseract/Indic OCR plus a handwriting model here, on-prem.
 * Handwritten Devanagari is realistically the weakest link in the whole pipeline,
 * which is why anything below the confidence threshold goes to a human
 * verification queue rather than silently into the index.
 */
export function extract(buffer: Buffer, mimeType: string, sidecarText?: string): ExtractionResult {
  if (sidecarText) {
    // Scanned/handwritten pages ship with a transcript in the demo corpus; we
    // treat them exactly as an OCR result, confidence included.
    const confidence = DEVANAGARI.test(sidecarText) ? 0.72 : 0.94;
    return {
      text: sidecarText,
      language: detectLanguage(sidecarText),
      engine: 'ocr-indic-handwriting (simulated)',
      confidence,
      needsHumanVerification: confidence < 0.85,
    };
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    const text = buffer.toString('utf8');
    return {
      text,
      language: detectLanguage(text),
      engine: 'native-text',
      confidence: 1,
      needsHumanVerification: false,
    };
  }
  if (mimeType === 'application/pdf') {
    // Naive but genuine: pull the text runs out of the content streams. Enough
    // for born-digital PDFs; scanned PDFs fall through to the verification queue.
    const raw = buffer.toString('latin1');
    const runs = [...raw.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)]
      .map((match) => match[0].slice(1, match[0].lastIndexOf(')')).replace(/\\([()\\])/g, '$1'));
    const text = runs.join(' ').trim();
    return {
      text,
      language: detectLanguage(text),
      engine: 'pdf-text-layer',
      confidence: text.length > 40 ? 0.9 : 0.2,
      needsHumanVerification: text.length <= 40,
    };
  }
  return {
    text: '',
    language: 'unknown',
    engine: 'none',
    confidence: 0,
    needsHumanVerification: true,
  };
}

export function indexDocument(documentId: string, caseId: string, title: string, result: ExtractionResult): void {
  run(
    `INSERT OR REPLACE INTO derived_text (document_id, text, language, engine, confidence, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    documentId, result.text, result.language, result.engine, result.confidence, now(),
  );
  run('DELETE FROM document_text WHERE document_id = ?', documentId);
  run(
    'INSERT INTO document_text (document_id, case_id, title, body) VALUES (?, ?, ?, ?)',
    documentId, caseId, title, result.text,
  );
  const vector = embed(`${title}\n${result.text}`);
  run(
    'INSERT OR REPLACE INTO embeddings (document_id, dims, vector, model) VALUES (?, ?, ?, ?)',
    documentId, DIMS, toBlob(vector), MODEL_ID,
  );
}

// ---------------------------------------------------------------- entities --

const PATTERNS: { type: string; pattern: RegExp; confidence: number }[] = [
  { type: 'phone', pattern: /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, confidence: 0.95 },
  { type: 'vehicle', pattern: /\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,2}[-\s]?\d{4}\b/g, confidence: 0.9 },
  { type: 'account', pattern: /\b\d{11,18}\b/g, confidence: 0.7 },
  { type: 'statute', pattern: /\b(?:BNS|BNSS|BSA|IPC|CrPC|POCSO|IT Act)\s*(?:§|section|sec\.?)?\s*\d+[A-Z]?\b/gi, confidence: 0.92 },
  { type: 'aadhaar', pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, confidence: 0.6 },
  { type: 'email', pattern: /[\w.+-]+@[\w-]+\.[\w.]+/g, confidence: 0.95 },
];

export function extractEntities(documentId: string, caseId: string, text: string): number {
  let count = 0;
  for (const { type, pattern, confidence } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      const normalised = value.replace(/[\s-]/g, '').toUpperCase();
      run(
        `INSERT INTO entities (id, case_id, document_id, type, value, normalised, confidence, verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        id('ENT'), caseId, documentId, type, value, normalised, confidence, now(),
      );
      count++;
    }
  }
  return count;
}

/**
 * Cross-case link analysis: the same phone number, vehicle or account appearing
 * in otherwise unconnected FIRs. For NCRB specifically this is the high-value
 * capability, because national pattern detection is their mandate.
 */
export function crossCaseLinks(minCases = 2) {
  return all<{ type: string; normalised: string; case_count: number; cases: string; documents: string }>(
    `SELECT e.type, e.normalised,
            COUNT(DISTINCT e.case_id) AS case_count,
            GROUP_CONCAT(DISTINCT e.case_id) AS cases,
            GROUP_CONCAT(DISTINCT e.document_id) AS documents
     FROM entities e
     WHERE e.type IN ('phone','vehicle','account','email')
     GROUP BY e.type, e.normalised
     HAVING case_count >= ?
     ORDER BY case_count DESC, e.type`,
    minCases,
  );
}

export { tokenize };
