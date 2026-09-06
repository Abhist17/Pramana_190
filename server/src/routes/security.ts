import type { FastifyInstance } from 'fastify';
import { all, get, json } from '../db/index.ts';
import { authenticate, authorise, denyResponse } from '../guard.ts';
import { proofForEvent, sealBatch, record as audit } from '../services/audit.ts';
import { openAlerts, acknowledgeAlert, actorBaseline } from '../services/anomaly.ts';
import { activePolicy, evaluate, explain, installPolicy, loadSubjectAssignments, type Action, type PolicySet } from '../policy/engine.ts';
import { ledger } from '../ledger/index.ts';
import { disposalCandidates, disposeDocument, setLegalHold, RETENTION_CLASSES } from '../services/retention.ts';
import { deadlineBoard, sweep, completeDeadline } from '../services/deadlines.ts';
import { loadUser, toSubject } from '../auth.ts';
import { badRequest } from './helpers.ts';

export default async function securityRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => { authenticate(request, reply); });

  // ---------------------------------------------------------------- audit --
  app.get('/audit', async (request, reply) => {
    const query = request.query as { caseId?: string; actorId?: string; outcome?: string; limit?: string };
    const check = authorise(request, {
      action: 'audit.read',
      resource: { type: 'audit', id: query.caseId ?? 'all', caseId: query.caseId, sensitivity: 1 },
      purposeCode: 'AUDIT',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const clauses: string[] = ['1=1'];
    const params: unknown[] = [];
    if (query.caseId) { clauses.push('a.case_id = ?'); params.push(query.caseId); }
    if (query.actorId) { clauses.push('a.actor_id = ?'); params.push(query.actorId); }
    if (query.outcome) { clauses.push('a.outcome = ?'); params.push(query.outcome); }
    params.push(Math.min(Number(query.limit ?? 200), 1000));

    const events = all(
      `SELECT a.*, u.full_name AS actor_name, u.designation AS actor_designation, c.case_number
       FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN cases c ON c.id = a.case_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.ts DESC LIMIT ?`,
      ...params,
    ).map((row) => ({ ...row, detail: json(row.detail, {}) }));

    return {
      events,
      batches: all('SELECT id, root, scope, event_count, anchor_id, created_at FROM audit_batches ORDER BY created_at DESC LIMIT 20'),
      unbatched: get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_events WHERE batch_id IS NULL')?.n ?? 0,
    };
  });

  app.get('/audit/:eventId/proof', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const check = authorise(request, {
      action: 'audit.read', resource: { type: 'audit', id: eventId, sensitivity: 1 }, purposeCode: 'AUDIT',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);
    return proofForEvent(eventId);
  });

  app.post('/audit/seal', async (request, reply) => {
    const check = authorise(request, {
      action: 'audit.read', resource: { type: 'audit', id: 'batch', sensitivity: 1 }, purposeCode: 'AUDIT',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);
    const result = await sealBatch();
    return result ?? { message: 'No unbatched events. Everything is already sealed and anchored.' };
  });

  // --------------------------------------------------------------- alerts --
  app.get('/alerts', async (request) => ({
    alerts: openAlerts().map((row) => ({ ...row, detail: json((row as { detail: string }).detail, {}) })),
  }));

  app.post('/alerts/:alertId/acknowledge', async (request) => {
    const { alertId } = request.params as { alertId: string };
    return acknowledgeAlert(alertId, request.user!.id);
  });

  app.get('/baseline/:userId', async (request) => {
    const { userId } = request.params as { userId: string };
    return actorBaseline(userId);
  });

  // ------------------------------------------------------------ directory --
  /**
   * Officer directory. Needed to assign a case, name a custodian, or pick a
   * subject in the policy simulator. Deliberately narrow: identity and posting
   * only, never keys, never clearance-bypassing detail.
   */
  app.get('/users', async () => ({
    users: all(
      `SELECT id, username, full_name AS fullName, designation, role, district, station,
              rank_level AS rankLevel, is_woman_officer AS isWomanOfficer, clearance_level AS clearanceLevel
       FROM users WHERE active = 1 ORDER BY rank_level DESC, full_name`,
    ),
  }));

  // --------------------------------------------------------------- policy --
  app.get('/policy', async () => {
    const { set, hash } = activePolicy();
    const anchorRow = get(
      "SELECT a.* FROM anchors a WHERE a.kind = 'policy' AND json_extract(a.payload, '$.policyHash') = ?", hash,
    );
    return { policy: set, policyHash: hash, anchor: anchorRow ?? null };
  });

  /**
   * Policy simulator. Pick any officer, any resource, any action and see exactly
   * which rules fire and why - including the ones that did not match. This is the
   * screen that turns "we have access control" into something a judge can check.
   */
  app.post('/policy/simulate', async (request, reply) => {
    const body = (request.body ?? {}) as {
      userId?: string; caseId?: string; documentId?: string; action?: Action; purposeCode?: string | null;
      breakGlass?: boolean;
    };
    if (!body.userId || !body.action) return reply.code(400).send(badRequest('userId and action are required'));
    const user = loadUser(body.userId);
    if (!user) return reply.code(404).send({ error: 'user_not_found' });

    const document = body.documentId
      ? get<Record<string, unknown>>('SELECT * FROM documents WHERE id = ?', body.documentId)
      : undefined;
    const caseRow = get<Record<string, unknown>>(
      'SELECT * FROM cases WHERE id = ?', document ? String(document.case_id) : body.caseId ?? '',
    );
    if (!caseRow) return reply.code(404).send({ error: 'case_not_found' });

    const accessRequest = {
      subject: { ...toSubject(user), assignments: loadSubjectAssignments(user.id) },
      resource: document
        ? {
            type: 'document' as const, id: String(document.id), caseId: String(document.case_id),
            district: String(caseRow.district), station: String(caseRow.station),
            sensitivity: Number(document.sensitivity), sensitiveMode: Number(caseRow.sensitive_mode) === 1,
            sealedCover: Number(document.sealed_cover) === 1, docClass: String(document.doc_class),
            docType: String(document.doc_type), legalHold: Number(document.legal_hold) === 1,
          }
        : {
            type: 'case' as const, id: String(caseRow.id), caseId: String(caseRow.id),
            district: String(caseRow.district), station: String(caseRow.station),
            sensitivity: Number(caseRow.sensitivity), sensitiveMode: Number(caseRow.sensitive_mode) === 1,
          },
      action: body.action,
      environment: {
        purposeCode: body.purposeCode ?? 'INVESTIGATION', hour: new Date().getHours(), ip: null,
        breakGlass: body.breakGlass ?? false, sharedWith: false,
      },
    };

    return { decision: evaluate(accessRequest), trace: explain(accessRequest), subject: accessRequest.subject };
  });

  app.post('/policy/install', async (request, reply) => {
    const check = authorise(request, {
      action: 'admin.policy', resource: { type: 'system', id: 'policy', sensitivity: 1 }, purposeCode: 'AUDIT',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);
    const body = request.body as PolicySet;
    if (!body?.rules) return reply.code(400).send(badRequest('a policy set with rules[] is required'));
    return installPolicy(body, request.user!.id);
  });

  // --------------------------------------------------------------- ledger --
  app.get('/ledger/status', async () => {
    const status = await ledger().status();
    return {
      ...status,
      blocks: all('SELECT number, prev_hash, block_hash, tx_root, timestamp FROM ledger_blocks ORDER BY number DESC LIMIT 15'),
      anchorsByKind: all('SELECT kind, COUNT(*) AS n FROM anchors GROUP BY kind ORDER BY n DESC'),
      recentAnchors: all('SELECT * FROM anchors ORDER BY created_at DESC LIMIT 20'),
    };
  });

  // ------------------------------------------------------------ retention --
  app.get('/retention', async () => ({
    classes: RETENTION_CLASSES,
    candidates: disposalCandidates(),
    disposals: all('SELECT * FROM disposal_records ORDER BY created_at DESC LIMIT 25'),
  }));

  /**
   * A legal hold is what stands between a court order and a document getting
   * lawfully-but-wrongly destroyed on schedule - lifting one has to clear the
   * same DSP-or-above bar as the other privileged retention/WSD operations,
   * not be reachable by any authenticated officer.
   */
  app.post('/retention/hold', async (request, reply) => {
    const { caseId, on, reason } = (request.body ?? {}) as { caseId?: string; on?: boolean; reason?: string };
    if (!caseId) return reply.code(400).send(badRequest('caseId is required'));
    if (request.user!.rank_level < 5) {
      audit({
        actorId: request.user!.id, actorLabel: request.user!.full_name,
        action: on !== false ? 'retention.hold_applied' : 'retention.hold_lifted', outcome: 'deny',
        resourceType: 'case', resourceId: caseId, caseId,
        detail: { reason: 'requires DSP rank or above', rankLevel: request.user!.rank_level },
      });
      return reply.code(403).send(badRequest('changing a legal hold requires DSP rank or above'));
    }
    return setLegalHold(caseId, on !== false, request.user!.id, reason ?? 'Legal hold applied');
  });

  app.post('/retention/dispose', async (request, reply) => {
    const { documentId, reason } = (request.body ?? {}) as { documentId?: string; reason?: string };
    if (!documentId) return reply.code(400).send(badRequest('documentId is required'));
    const document = get<Record<string, unknown>>('SELECT * FROM documents WHERE id = ?', documentId);
    if (!document) return reply.code(404).send({ error: 'not_found' });
    const caseRow = get<Record<string, unknown>>('SELECT * FROM cases WHERE id = ?', String(document.case_id));

    const check = authorise(request, {
      action: 'document.dispose',
      resource: {
        type: 'document', id: documentId, caseId: String(document.case_id),
        district: String(caseRow?.district ?? ''), station: String(caseRow?.station ?? ''),
        sensitivity: Number(document.sensitivity), legalHold: Number(document.legal_hold) === 1,
      },
      purposeCode: 'RECORDS',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    try {
      return await disposeDocument(documentId, request.user!.id, reason ?? 'Retention period expired');
    } catch (error) {
      return reply.code(409).send(badRequest(String((error as Error).message)));
    }
  });

  // ------------------------------------------------------------ deadlines --
  app.get('/deadlines/board', async (request) => {
    const query = request.query as { district?: string; station?: string };
    sweep();
    const board = deadlineBoard(query);
    return {
      board,
      summary: {
        total: board.length,
        breached: board.filter((d) => d.status === 'breached' || d.percentElapsed >= 1).length,
        critical: board.filter((d) => d.status !== 'breached' && d.percentElapsed >= 0.9 && d.percentElapsed < 1).length,
        warning: board.filter((d) => d.status !== 'breached' && d.percentElapsed >= 0.6 && d.percentElapsed < 0.9).length,
      },
    };
  });

  app.post('/deadlines/:deadlineId/complete', async (request, reply) => {
    const { deadlineId } = request.params as { deadlineId: string };
    const { delayReason } = (request.body ?? {}) as { delayReason?: string };
    try {
      return completeDeadline(deadlineId, request.user!.id, delayReason);
    } catch (error) {
      return reply.code(400).send(badRequest(String((error as Error).message)));
    }
  });

  // ------------------------------------------------------------ dashboard --
  app.get('/dashboard', async (request) => {
    sweep();
    const user = request.user!;
    const board = deadlineBoard(user.rank_level >= 5 ? { district: user.district } : { station: user.station ?? undefined });
    const status = await ledger().status();
    return {
      cases: get<{ n: number }>('SELECT COUNT(*) AS n FROM cases')?.n ?? 0,
      sensitiveCases: get<{ n: number }>('SELECT COUNT(*) AS n FROM cases WHERE sensitive_mode = 1')?.n ?? 0,
      documents: get<{ n: number }>('SELECT COUNT(*) AS n FROM documents')?.n ?? 0,
      anchors: get<{ n: number }>('SELECT COUNT(*) AS n FROM anchors')?.n ?? 0,
      auditEvents: get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_events')?.n ?? 0,
      auditBatches: get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_batches')?.n ?? 0,
      openAlerts: get<{ n: number }>("SELECT COUNT(*) AS n FROM alerts WHERE status = 'open'")?.n ?? 0,
      compromised: get<{ n: number }>("SELECT COUNT(*) AS n FROM documents WHERE integrity_status = 'compromised'")?.n ?? 0,
      ledger: status,
      deadlines: {
        breached: board.filter((d) => d.status === 'breached' || d.percentElapsed >= 1).length,
        critical: board.filter((d) => d.status !== 'breached' && d.percentElapsed >= 0.9 && d.percentElapsed < 1).length,
        upcoming: board.slice(0, 6),
      },
      alerts: openAlerts(6).map((row) => ({ ...row, detail: json((row as { detail: string }).detail, {}) })),
    };
  });
}
