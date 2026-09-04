import type { FastifyInstance } from 'fastify';
import { get } from '../db/index.ts';
import { authenticate, authorise } from '../guard.ts';
import { hybridSearch } from '../services/search.ts';
import { MODEL_ID } from '../services/embeddings.ts';
import { record as audit } from '../services/audit.ts';
import { loadCase, documentResource } from './helpers.ts';
import { loadDocument } from '../services/documents.ts';

export default async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => { authenticate(request, reply); });

  app.get('/', async (request) => {
    const query = request.query as { q?: string; purpose?: string; limit?: string };
    const term = (query.q ?? '').trim();
    const purposeCode = query.purpose ?? 'INVESTIGATION';

    // The query itself is logged. Searching for a case you have no connection to
    // is a signal in its own right.
    audit({
      actorId: request.user!.id, actorLabel: request.user!.full_name, action: 'search.query',
      outcome: 'allow', purposeCode, detail: { query: term },
    });
    if (!term) return { query: term, hits: [], model: MODEL_ID };

    const raw = hybridSearch(term, Number(query.limit ?? 20) * 2);

    /**
     * Results are filtered through the same policy engine as a direct read.
     * A document you may not see does not appear - and does not appear as a
     * "restricted result" either, because the existence of a sealed document can
     * itself be sensitive.
     */
    const permitted = raw.filter((hit) => {
      const document = loadDocument(hit.documentId);
      if (!document) return false;
      const caseRow = loadCase(document.case_id);
      if (!caseRow) return false;
      return authorise(request, {
        action: 'document.read',
        resource: documentResource(document as unknown as Record<string, unknown>, caseRow),
        purposeCode,
        detail: { via: 'search', query: term },
      }).allowed;
    });

    const hits = permitted.slice(0, Number(query.limit ?? 20)).map((hit) => {
      const caseRow = get<{ case_number: string; title: string; sensitive_mode: number }>(
        'SELECT case_number, title, sensitive_mode FROM cases WHERE id = ?', hit.caseId,
      );
      const document = loadDocument(hit.documentId)!;
      return {
        ...hit,
        caseNumber: caseRow?.case_number ?? hit.caseId,
        caseTitle: caseRow?.title ?? '',
        sensitiveMode: caseRow?.sensitive_mode === 1,
        docType: document.doc_type,
        language: document.language,
      };
    });

    return {
      query: term,
      hits,
      totalMatched: raw.length,
      withheldByPolicy: raw.length - permitted.length,
      model: MODEL_ID,
      note: 'Hybrid retrieval: BM25 lexical + dense semantic, fused by reciprocal rank. Cross-script matching is active - an English query reaches Hindi documents.',
    };
  });
}
