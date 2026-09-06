import type { FastifyInstance } from 'fastify';
import { all, get, run, now, json } from '../db/index.ts';
import { authenticate, authorise, denyResponse, watermark } from '../guard.ts';
import { loadCase, caseResource, documentResource, documentView, badRequest } from './helpers.ts';
import {
  sealDocument, loadDocument, decryptDocument, verifyDocument, versionChain, renditionsOf,
} from '../services/documents.ts';
import { custodyChain, recordCustody, acknowledgeCustody, handoverCase } from '../services/custody.ts';
import { generateCertificate, signCertificate, verifyCertificateSignatures, listCertificates, certificatePath } from '../services/certificate.ts';
import { detectPii, applyRedactions, type PiiMatch } from '../services/redaction.ts';
import { checkWomanOfficerRequirement } from '../services/wsd.ts';
import { record as audit } from '../services/audit.ts';
import { RETENTION_CLASSES } from '../services/retention.ts';

export default async function documentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => { authenticate(request, reply); });

  // ------------------------------------------------------------- capture --
  app.post('/', async (request, reply) => {
    const user = request.user!;
    const parts = await request.file();
    if (!parts) return reply.code(400).send(badRequest('a multipart file upload is required'));

    const fields = parts.fields as Record<string, { value?: string } | undefined>;
    const field = (name: string) => fields[name]?.value;
    const caseId = field('caseId');
    if (!caseId) return reply.code(400).send(badRequest('caseId is required'));

    const caseRow = loadCase(caseId);
    if (!caseRow) return reply.code(404).send({ error: 'case_not_found' });

    const docType = field('docType') ?? 'case_diary';

    // Statutory role enforcement at the point of upload, not as an audit finding
    // months later.
    const womanOfficer = checkWomanOfficerRequirement(
      docType, user.is_woman_officer === 1, caseRow.sensitive_mode === 1,
    );
    if (!womanOfficer.satisfied) {
      audit({
        actorId: user.id, actorLabel: user.full_name, action: 'document.create', outcome: 'deny',
        resourceType: 'document', resourceId: null, caseId: caseRow.id,
        reason: womanOfficer.message ?? 'statutory role requirement not met',
        detail: { docType, basis: womanOfficer.basis },
      });
      return reply.code(403).send({
        error: 'statutory_role_required', message: womanOfficer.message, basis: womanOfficer.basis,
      });
    }

    const check = authorise(request, {
      action: 'document.create',
      resource: { ...caseResource(caseRow), type: 'document', id: 'new' },
      purposeCode: field('purpose') ?? 'INVESTIGATION',
      detail: { docType },
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const content = await parts.toBuffer();
    const result = await sealDocument({
      caseId: caseRow.id,
      title: field('title') ?? parts.filename,
      docClass: field('docClass') ?? 'investigation',
      docType,
      sensitivity: Number(field('sensitivity') ?? caseRow.sensitivity),
      language: field('language'),
      mimeType: parts.mimetype,
      content,
      createdBy: user.id,
      signerPrivateKey: user.private_key,
      captureMeta: json<Record<string, unknown>>(field('captureMeta'), {
        source: 'web-console', uploadedBy: user.designation, capturedAt: now(), ip: request.ip,
      }),
      sidecarText: field('sidecarText'),
      previousVersionId: field('previousVersionId'),
      changeNote: field('changeNote'),
    });

    return reply.code(201).send({
      ...result,
      message: `Sealed. Fingerprint recorded on ${result.blockNumber === null ? 'the ledger' : `block ${result.blockNumber}`} before the document left this machine.`,
    });
  });

  // -------------------------------------------------------------- reading --
  app.get('/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const purposeCode = (request.query as { purpose?: string }).purpose ?? null;
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    const caseRow = loadCase(document.case_id)!;

    const check = authorise(request, {
      action: 'document.read', resource: documentResource(document, caseRow), purposeCode,
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const derived = get<{ text: string; language: string; engine: string; confidence: number; verified_at: string | null }>(
      'SELECT text, language, engine, confidence, verified_at FROM derived_text WHERE document_id = ?', documentId,
    );

    return {
      document: documentView(document),
      case: { id: caseRow.id, caseNumber: caseRow.case_number, sensitiveMode: caseRow.sensitive_mode === 1 },
      versions: versionChain(documentId).map(documentView),
      renditions: renditionsOf(documentId).map(documentView),
      custody: custodyChain('document', documentId),
      certificates: listCertificates(caseRow.id).filter((c) => (c as { document_id: string }).document_id === documentId),
      anchor: document.anchor_id ? get('SELECT * FROM anchors WHERE id = ?', document.anchor_id) : null,
      derivedText: derived
        ? {
            text: derived.text, language: derived.language, engine: derived.engine,
            confidence: derived.confidence,
            // AI output is visibly machine-generated with a confidence score and a
            // human-verification state. It is an index, never evidence.
            machineGenerated: true,
            humanVerified: Boolean(derived.verified_at),
            needsVerification: derived.confidence < 0.85 && !derived.verified_at,
          }
        : null,
      entities: all('SELECT * FROM entities WHERE document_id = ?', documentId),
      watermark: watermark(request.user!, caseRow.case_number),
      obligations: check.decision.obligations,
      retention: RETENTION_CLASSES[document.retention_class] ?? null,
    };
  });

  app.get('/:documentId/content', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const purposeCode = (request.query as { purpose?: string }).purpose ?? null;
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    const caseRow = loadCase(document.case_id)!;

    const check = authorise(request, {
      action: 'document.download', resource: documentResource(document, caseRow), purposeCode,
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    try {
      const content = decryptDocument(document);
      return reply
        .header('Content-Type', document.mime_type)
        .header('X-PRAMANA-Watermark', watermark(request.user!, caseRow.case_number))
        .header('X-PRAMANA-Hash', `${document.hash_algorithm}:${document.hash_value}`)
        .send(content);
    } catch {
      return reply.code(409).send({
        error: 'integrity_failure',
        message: 'Authenticated decryption failed - the stored object has been modified. Content will not be served.',
      });
    }
  });

  // --------------------------------------------------------- verification --
  app.get('/:documentId/verify', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    const caseRow = loadCase(document.case_id)!;
    const check = authorise(request, {
      action: 'document.read', resource: documentResource(document, caseRow), purposeCode: 'AUDIT',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);
    return verifyDocument(documentId);
  });

  // -------------------------------------------------------------- custody --
  app.post('/:documentId/custody/transfer', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const { toUser, reason, location } = (request.body ?? {}) as { toUser?: string; reason?: string; location?: string };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    if (!toUser || !reason) return reply.code(400).send(badRequest('toUser and reason are required'));
    const caseRow = loadCase(document.case_id)!;

    const check = authorise(request, {
      action: 'custody.transfer', resource: documentResource(document, caseRow), purposeCode: 'INVESTIGATION',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const event = await recordCustody({
      subjectType: 'document', subjectId: documentId, caseId: document.case_id, action: 'transfer',
      fromUser: request.user!.id, toUser, reason, location, itemHash: document.hash_value,
      signerPrivateKey: request.user!.private_key,
    });
    return { ...event, message: 'Transfer signed by the releasing officer. Awaiting the receiving officer’s acknowledgement.' };
  });

  app.post('/custody/:eventId/acknowledge', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    try {
      return acknowledgeCustody(eventId, request.user!.id, request.user!.private_key);
    } catch (error) {
      return reply.code(400).send(badRequest(String((error as Error).message)));
    }
  });

  /** Officer transfer: hands over the case with a signed manifest of its contents. */
  app.post('/case/:caseId/handover', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const { toUser, reason } = (request.body ?? {}) as { toUser?: string; reason?: string };
    const caseRow = loadCase(caseId);
    if (!caseRow) return reply.code(404).send({ error: 'not_found' });
    if (!toUser) return reply.code(400).send(badRequest('toUser is required'));

    const check = authorise(request, {
      action: 'custody.transfer', resource: caseResource(caseRow), purposeCode: 'INVESTIGATION',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const result = await handoverCase(
      caseRow.id, request.user!.id, toUser, request.user!.private_key,
      reason ?? 'Officer transfer - case handover',
    );
    return {
      ...result,
      message: `Handover manifest of ${result.documentCount} documents hashed and signed. Nothing can go missing without it being provable.`,
    };
  });

  // ---------------------------------------------------------- certificate --
  app.post('/:documentId/certificate', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const { purpose } = (request.body ?? {}) as { purpose?: string };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    const caseRow = loadCase(document.case_id)!;

    const check = authorise(request, {
      action: 'document.certify', resource: documentResource(document, caseRow), purposeCode: 'COURT_PRODUCTION',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const result = await generateCertificate(documentId, request.user!.id, purpose ?? 'Production before court');
    return reply.code(201).send(result);
  });

  /**
   * A certificate carries the same document content and case context as the
   * document itself (BSA production statement, hash, custody chain) - so
   * reading, signing or downloading one is authorised exactly like reading the
   * underlying document, never left open just because the ID is a certificate
   * ID rather than a document ID.
   */
  function authoriseCertificateAccess(
    request: import('fastify').FastifyRequest,
    reply: import('fastify').FastifyReply,
    documentId: string,
    action: 'document.certify' | 'document.read',
  ): boolean {
    const document = loadDocument(documentId);
    if (!document) return false;
    const caseRow = loadCase(document.case_id)!;
    const check = authorise(request, {
      action, resource: documentResource(document, caseRow), purposeCode: 'COURT_PRODUCTION',
    });
    if (!check.allowed) {
      denyResponse(reply, check.decision);
      return false;
    }
    return true;
  }

  app.post('/certificates/:certificateId/sign', async (request, reply) => {
    const { certificateId } = request.params as { certificateId: string };
    const { role } = (request.body ?? {}) as { role?: 'device_custodian' | 'expert' };
    if (role !== 'device_custodian' && role !== 'expert') {
      return reply.code(400).send(badRequest('role must be device_custodian or expert'));
    }
    const certRow = get<{ document_id: string }>('SELECT document_id FROM certificates WHERE id = ?', certificateId);
    if (!certRow) return reply.code(404).send({ error: 'not_found' });
    if (!authoriseCertificateAccess(request, reply, certRow.document_id, 'document.certify')) return reply;

    try {
      return await signCertificate(certificateId, role, request.user!.id);
    } catch (error) {
      return reply.code(400).send(badRequest(String((error as Error).message)));
    }
  });

  app.get('/certificates/:certificateId', async (request, reply) => {
    const { certificateId } = request.params as { certificateId: string };
    const row = get<{ payload: string; status: string; document_id: string; case_id: string; created_at: string }>(
      'SELECT payload, status, document_id, case_id, created_at FROM certificates WHERE id = ?', certificateId,
    );
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!authoriseCertificateAccess(request, reply, row.document_id, 'document.read')) return reply;
    return {
      certificateId, status: row.status, documentId: row.document_id, caseId: row.case_id,
      createdAt: row.created_at, payload: json(row.payload, {}),
      signatures: verifyCertificateSignatures(certificateId),
    };
  });

  app.get('/certificates/:certificateId/pdf', async (request, reply) => {
    const { certificateId } = request.params as { certificateId: string };
    const certRow = get<{ document_id: string }>('SELECT document_id FROM certificates WHERE id = ?', certificateId);
    if (!certRow) return reply.code(404).send({ error: 'not_found' });
    if (!authoriseCertificateAccess(request, reply, certRow.document_id, 'document.read')) return reply;
    const path = certificatePath(certificateId);
    if (!path) return reply.code(404).send({ error: 'not_found' });
    const { readFileSync } = await import('node:fs');
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="evidence-certificate-${certificateId}.pdf"`)
      .send(readFileSync(path));
  });

  // ------------------------------------------------------------ redaction --
  app.get('/:documentId/redaction/proposals', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    const caseRow = loadCase(document.case_id)!;
    const check = authorise(request, {
      action: 'document.redact', resource: documentResource(document, caseRow), purposeCode: 'DISCLOSURE',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const derived = get<{ text: string }>('SELECT text FROM derived_text WHERE document_id = ?', documentId);
    const text = derived?.text ?? '';
    return {
      documentId,
      text,
      proposals: detectPii(text),
      note: 'Machine-proposed. Every span requires human confirmation before a redacted rendition is issued.',
    };
  });

  app.post('/:documentId/redaction/apply', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const { approved, purpose } = (request.body ?? {}) as { approved?: PiiMatch[]; purpose?: string };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    if (!Array.isArray(approved)) return reply.code(400).send(badRequest('approved[] spans are required'));
    const caseRow = loadCase(document.case_id)!;

    const check = authorise(request, {
      action: 'document.redact', resource: documentResource(document, caseRow), purposeCode: 'DISCLOSURE',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const derived = get<{ text: string }>('SELECT text FROM derived_text WHERE document_id = ?', documentId);
    if (!derived) return reply.code(409).send(badRequest('no extracted text is available for this document'));

    // The redaction is a NEW sealed object with its own hash and its own access
    // rules. The original stays sealed and untouched.
    const redacted = applyRedactions(derived.text, approved);
    const result = await sealDocument({
      caseId: caseRow.id,
      title: `${document.title} (redacted)`,
      docClass: document.doc_class,
      docType: document.doc_type,
      sensitivity: Math.max(document.sensitivity - 1, 1),
      language: document.language,
      mimeType: 'text/plain',
      content: Buffer.from(redacted, 'utf8'),
      createdBy: request.user!.id,
      signerPrivateKey: request.user!.private_key,
      parentDocumentId: documentId,
      renditionType: 'redacted',
      captureMeta: {
        derivedFrom: documentId, originalHash: document.hash_value,
        redactedSpans: approved.length, purpose: purpose ?? 'DISCLOSURE',
      },
    });
    return reply.code(201).send({
      ...result,
      originalDocumentId: documentId,
      redactedSpans: approved.length,
      message: 'Redacted rendition sealed as a separate object. Content was removed, not covered - the original is untouched.',
    });
  });

  // -------------------------------------------------------------- sharing --
  app.post('/:documentId/share', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const { granteeId, purpose, days } = (request.body ?? {}) as { granteeId?: string; purpose?: string; days?: number };
    const document = loadDocument(documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    if (!granteeId || !purpose) return reply.code(400).send(badRequest('granteeId and purpose are required'));
    const caseRow = loadCase(document.case_id)!;

    const check = authorise(request, {
      action: 'document.share', resource: documentResource(document, caseRow), purposeCode: 'DISCLOSURE',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const { id: makeId } = await import('../core/ids.ts');
    const shareId = makeId('SHA');
    const expires = new Date(Date.now() + (days ?? 30) * 86_400_000).toISOString();
    run(
      `INSERT INTO shares (id, case_id, document_ids, grantee_id, purpose, granted_by, expires_at, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      shareId, caseRow.id, JSON.stringify([documentId]), granteeId, purpose, request.user!.id,
      expires, now(),
    );
    audit({
      actorId: request.user!.id, actorLabel: request.user!.full_name, action: 'document.share',
      outcome: 'allow', resourceType: 'document', resourceId: documentId, caseId: caseRow.id,
      purposeCode: 'DISCLOSURE', detail: { shareId, granteeId, expires, purpose },
    });
    return reply.code(201).send({ shareId, granteeId, purpose, expiresAt: expires });
  });
}
