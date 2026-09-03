import { all } from '../db/index.ts';
import { embed, cosine, fromBlob } from './embeddings.ts';
import { expand } from './lexicon.ts';
import { tokenize } from './embeddings.ts';

/**
 * Hybrid retrieval: BM25 (SQLite FTS5) fused with dense cosine similarity by
 * reciprocal rank fusion.
 *
 * Keyword catches names, case numbers and section references exactly. Semantic
 * catches "the witness who saw a red vehicle near the school" when the document
 * actually says "मैरून गाड़ी प्राथमिक विद्यालय के पास". Neither half is
 * sufficient on its own, which is why both run on every query.
 *
 * Results are filtered through the policy engine by the caller BEFORE they are
 * returned. A document you may not see does not appear — and does not appear as a
 * "restricted result" either, because the existence of a sealed document can
 * itself be sensitive.
 */

export type SearchHit = {
  documentId: string;
  caseId: string;
  title: string;
  snippet: string;
  lexicalRank: number | null;
  semanticRank: number | null;
  score: number;
  matchedVia: ('keyword' | 'semantic')[];
};

const RRF_K = 60;

function escapeFts(query: string): string {
  // FTS5 MATCH is its own grammar; quoting each token avoids syntax errors on
  // user input while keeping OR semantics across the expanded token set.
  const tokens = tokenize(query);
  const expanded = tokens.flatMap((token) => [token, ...expand(token)]);
  const unique = [...new Set(expanded)].filter(Boolean);
  if (unique.length === 0) return '""';
  return unique.map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ');
}

export function hybridSearch(query: string, limit = 20): SearchHit[] {
  const lexical = all<{ document_id: string; case_id: string; title: string; snippet: string; rank: number }>(
    `SELECT document_id, case_id, title,
            snippet(document_text, 3, '<mark>', '</mark>', ' … ', 24) AS snippet,
            rank
     FROM document_text
     WHERE document_text MATCH ?
     ORDER BY rank
     LIMIT ?`,
    escapeFts(query),
    limit * 3,
  );

  const queryVector = embed(query);
  const semantic = all<{ document_id: string; vector: Uint8Array }>(
    'SELECT document_id, vector FROM embeddings',
  )
    .map((row) => ({ documentId: row.document_id, score: cosine(queryVector, fromBlob(row.vector)) }))
    .filter((row) => row.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 3);

  const merged = new Map<string, SearchHit>();

  lexical.forEach((row, index) => {
    merged.set(row.document_id, {
      documentId: row.document_id,
      caseId: row.case_id,
      title: row.title,
      snippet: row.snippet,
      lexicalRank: index + 1,
      semanticRank: null,
      score: 1 / (RRF_K + index + 1),
      matchedVia: ['keyword'],
    });
  });

  semantic.forEach((row, index) => {
    const existing = merged.get(row.documentId);
    const contribution = 1 / (RRF_K + index + 1);
    if (existing) {
      existing.semanticRank = index + 1;
      existing.score += contribution;
      existing.matchedVia.push('semantic');
      return;
    }
    const meta = all<{ case_id: string; title: string; body: string }>(
      'SELECT case_id, title, body FROM document_text WHERE document_id = ?', row.documentId,
    )[0];
    if (!meta) return;
    merged.set(row.documentId, {
      documentId: row.documentId,
      caseId: meta.case_id,
      title: meta.title,
      snippet: `${meta.body.slice(0, 180).trim()} …`,
      lexicalRank: null,
      semanticRank: index + 1,
      score: contribution,
      matchedVia: ['semantic'],
    });
  });

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
