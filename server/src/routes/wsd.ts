import type { FastifyInstance } from 'fastify';
import { all, get } from '../db/index.ts';
import { authenticate, authorise, denyResponse } from '../guard.ts';
import { loadCase, caseResource, badRequest } from './helpers.ts';
import {
  requestDeanonymisation, approveDeanonymisation, revealIdentity, pendingVaultRequests,
  sealIdentity, vaultEntriesForCase, enableSensitiveMode, disableSensitiveMode, assessSections,
  SENSITIVE_SECTIONS, WOMAN_OFFICER_REQUIRED_TYPES,
} from '../services/wsd.ts';
import { sealUnderThreshold, requestUnseal, approveUnseal, openSealed, sealStatus } from '../services/sealedCover.ts';
import { deadlineBoard } from '../services/deadlines.ts';

export default async function wsdRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => { authenticate(request, reply); });

  /** Women Safety Division oversight console. */
  app.get('/overview', async () => {
    const cases = all<{ id: string; case_number: string; title: string; district: string; station: string; offence_category: string; sensitivity: number; victim_pseudonym: string | null; registered_at: string }>(
      `SELECT id, case_number, title, district, station, offence_category, sensitivity, victim_pseudonym, registered_at
       FROM cases WHERE sensitive_mode = 1 ORDER BY registered_at DESC`,
    );
    const board = deadlineBoard();
    const sensitiveIds = new Set(cases.map((c) => c.id));
    const sensitiveDeadlines = board.filter((d) => sensitiveIds.has(d.caseId));

    // District heat map for the division's own oversight.
    const heatmap = new Map<string, { district: string; cases: number; breachedDeadlines: number; criticalDeadlines: number }>();
    for (const row of cases) {
      const entry = heatmap.get(row.district) ?? { district: row.district, cases: 0, breachedDeadlines: 0, criticalDeadlines: 0 };
      entry.cases++;
      heatmap.set(row.district, entry);
    }
    for (const deadline of sensitiveDeadlines) {
      const caseRow = cases.find((c) => c.id === deadline.caseId);
      if (!caseRow) continue;
      const entry = heatmap.get(caseRow.district)!;
      if (deadline.percentElapsed >= 1) entry.breachedDeadlines++;
      else if (deadline.percentElapsed >= 0.9) entry.criticalDeadlines++;
    }

    return {
      cases: cases.map((row) => ({
        id: row.id, caseNumber: row.case_number, title: row.title, district: row.district,
        station: row.station, offenceCategory: row.offence_category, sensitivity: row.sensitivity,
        // The list itself never carries a real name.
        victim: row.victim_pseudonym, registeredAt: row.registered_at,
      })),
      deadlines: sensitiveDeadlines,
      heatmap: [...heatmap.values()],
      vaultRequests: pendingVaultRequests(),
      triggers: SENSITIVE_SECTIONS.map((s) => ({ pattern: String(s.pattern), category: s.category, label: s.label })),
      womanOfficerRequiredTypes: WOMAN_OFFICER_REQUIRED_TYPES,
    };
  });

  app.post('/assess', async (request) => {
    const { sections } = (request.body ?? {}) as { sections?: string[] };
    return assessSections(sections ?? []);
  });

  app.get('/vault/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const caseRow = loadCase(caseId);
    if (!caseRow) return reply.code(404).send({ error: 'not_found' });
    const check = authorise(request, {
      action: 'case.read', resource: caseResource(caseRow), purposeCode: 'INVESTIGATION',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);
    return { entries: vaultEntriesForCase(caseRow.id), requests: pendingVaultRequests(caseRow.id) };
  });

  app.post('/vault/:caseId/seal', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const body = (request.body ?? {}) as { subject?: { fullName: string }; kind?: 'victim' | 'protected_witness' | 'source' };
    const caseRow = loadCase(caseId);
    if (!caseRow) return reply.code(404).send({ error: 'not_found' });
    if (!body.subject?.fullName) return reply.code(400).send(badRequest('subject.fullName is required'));
    const check = authorise(request, {
      action: 'case.write', resource: caseResource(caseRow), purposeCode: 'INVESTIGATION',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);
    return sealIdentity(caseRow.id, body.subject, body.kind ?? 'victim');
  });

  app.post('/vault/request', async (request, reply) => {
    const { vaultId, reason } = (request.body ?? {}) as { vaultId?: string; reason?: string };
    if (!vaultId || !reason) return reply.code(400).send(badRequest('vaultId and reason are required'));
    const vault = get<{ case_id: string }>('SELECT case_id FROM victim_vault WHERE id = ?', vaultId);
    if (!vault) return reply.code(404).send({ error: 'not_found' });
    const caseRow = loadCase(vault.case_id)!;

    const check = authorise(request, {
      action: 'vault.deanonymise', resource: caseResource(caseRow), purposeCode: 'INVESTIGATION',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    try {
      const result = await requestDeanonymisation(vaultId, request.user!.id, reason);
      return {
        ...result,
        message: 'Request recorded and anchored. Two DSP-or-above approvals and the waiting period are required before any name is shown.',
      };
    } catch (error) {
      return reply.code(400).send(badRequest(String((error as Error).message)));
    }
  });

  app.post('/vault/request/:requestId/approve', async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    try {
      return approveDeanonymisation(requestId, request.user!.id, request.user!.rank_level);
    } catch (error) {
      return reply.code(403).send(badRequest(String((error as Error).message)));
    }
  });

  app.post('/vault/request/:requestId/reveal', async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    try {
      return revealIdentity(requestId, request.user!.id);
    } catch (error) {
      return reply.code(403).send(badRequest(String((error as Error).message)));
    }
  });

  app.post('/sensitive-mode', async (request, reply) => {
    const { caseId, enable, reason } = (request.body ?? {}) as { caseId?: string; enable?: boolean; reason?: string };
    if (!caseId || !reason) return reply.code(400).send(badRequest('caseId and reason are required'));
    const caseRow = loadCase(caseId);
    if (!caseRow) return reply.code(404).send({ error: 'not_found' });
    try {
      if (enable === false) {
        disableSensitiveMode(caseRow.id, request.user!.id, request.user!.rank_level, reason);
        return { caseId: caseRow.id, sensitiveMode: false };
      }
      enableSensitiveMode(caseRow.id, request.user!.id, reason);
      return { caseId: caseRow.id, sensitiveMode: true };
    } catch (error) {
      return reply.code(403).send(badRequest(String((error as Error).message)));
    }
  });

  // -------------------------------------------------------- sealed cover --
  app.get('/sealed/:documentId', async (request) => {
    const { documentId } = request.params as { documentId: string };
    return sealStatus(documentId) ?? { sealed: false };
  });

  app.post('/sealed/:documentId/seal', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const { custodians, threshold } = (request.body ?? {}) as { custodians?: string[]; threshold?: number };
    if (!Array.isArray(custodians) || custodians.length < 2) {
      return reply.code(400).send(badRequest('at least two custodians are required'));
    }
    try {
      const result = await sealUnderThreshold(documentId, custodians, threshold ?? 2, request.user!.id);
      return {
        ...result,
        message: `Sealed under ${result.threshold}-of-${result.totalShares} threshold. The single-party key has been destroyed - no individual, administrator included, can now decrypt this document.`,
      };
    } catch (error) {
      return reply.code(400).send(badRequest(String((error as Error).message)));
    }
  });

  app.post('/sealed/:documentId/request', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const { reason } = (request.body ?? {}) as { reason?: string };
    try {
      return await requestUnseal(documentId, request.user!.id, reason ?? '');
    } catch (error) {
      return reply.code(400).send(badRequest(String((error as Error).message)));
    }
  });

  app.post('/sealed/request/:requestId/approve', async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    try {
      return approveUnseal(requestId, request.user!.id);
    } catch (error) {
      return reply.code(403).send(badRequest(String((error as Error).message)));
    }
  });

  app.post('/sealed/request/:requestId/open', async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    try {
      const content = await openSealed(requestId, request.user!.id);
      return reply.header('Content-Type', 'application/octet-stream').send(content);
    } catch (error) {
      return reply.code(403).send(badRequest(String((error as Error).message)));
    }
  });
}
