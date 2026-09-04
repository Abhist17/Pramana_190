import type { FastifyInstance } from 'fastify';
import { all, get, run, now, json } from '../db/index.ts';
import { authenticate, authorise, denyResponse } from '../guard.ts';
import { loadCase, caseResource, caseView, documentView, badRequest } from './helpers.ts';
import { id } from '../core/ids.ts';
import { assessSections, enableSensitiveMode, sealIdentity, vaultEntriesForCase } from '../services/wsd.ts';
import { createDeadlinesForCase, deadlinesForCase } from '../services/deadlines.ts';
import { crossCaseLinks } from '../services/extraction.ts';
import { record as audit } from '../services/audit.ts';

/**
 * Required document set by offence category. The completeness checker uses this
 * to tell an officer what the file is still missing - before the prosecutor
 * discovers it in court.
 */
const REQUIRED_DOCUMENTS: Record<string, { docType: string; label: string; basis: string }[]> = {
  sexual_offence: [
    { docType: 'fir', label: 'First Information Report', basis: 'BNSS s.173' },
    { docType: 'victim_statement', label: 'Victim statement (woman officer)', basis: 'BNSS s.176(1) proviso' },
    { docType: 'medical_report', label: 'Medical examination report', basis: 'BNSS s.184' },
    { docType: 'fsl_report', label: 'Forensic science laboratory report', basis: 'BNSS s.176(3)' },
    { docType: 'scene_photograph', label: 'Scene photographs / videography', basis: 'BNSS s.176(3)' },
    { docType: 'witness_statement', label: 'Witness statements', basis: 'BNSS s.180' },
    { docType: 'chargesheet', label: 'Charge sheet / final report', basis: 'BNSS s.193' },
  ],
  pocso: [
    { docType: 'fir', label: 'First Information Report', basis: 'BNSS s.173' },
    { docType: 'victim_statement', label: 'Child victim statement', basis: 'POCSO s.24' },
    { docType: 'medical_report', label: 'Medical examination report', basis: 'POCSO s.27' },
    { docType: 'support_person', label: 'Support person appointment record', basis: 'POCSO Rules' },
    { docType: 'chargesheet', label: 'Charge sheet / final report', basis: 'BNSS s.193' },
  ],
  general: [
    { docType: 'fir', label: 'First Information Report', basis: 'BNSS s.173' },
    { docType: 'case_diary', label: 'Case diary', basis: 'BNSS s.192' },
    { docType: 'witness_statement', label: 'Witness statements', basis: 'BNSS s.180' },
    { docType: 'chargesheet', label: 'Charge sheet / final report', basis: 'BNSS s.193' },
  ],
};

export default async function caseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => { authenticate(request, reply); });

  /** Case list is policy-filtered: a case you may not see does not appear at all. */
  app.get('/', async (request) => {
    const rows = all<Parameters<typeof caseView>[0]>('SELECT * FROM cases ORDER BY registered_at DESC');
    const visible = rows.filter((row) => {
      const check = authorise(request, {
        action: 'case.read', resource: caseResource(row), purposeCode: 'INVESTIGATION',
        detail: { via: 'case list' },
      });
      return check.allowed;
    });
    return { cases: visible.map(caseView), total: rows.length, visible: visible.length };
  });

  app.get('/:caseId', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const purposeCode = (request.query as { purpose?: string }).purpose ?? 'INVESTIGATION';
    const row = loadCase(caseId);
    if (!row) return reply.code(404).send({ error: 'not_found' });

    const check = authorise(request, { action: 'case.read', resource: caseResource(row), purposeCode });
    if (!check.allowed) return denyResponse(reply, check.decision);

    const documents = all('SELECT * FROM documents WHERE case_id = ? ORDER BY created_at DESC', row.id);
    const assignments = all(
      `SELECT ca.role, ca.assigned_at, u.id, u.full_name, u.designation
       FROM case_assignments ca JOIN users u ON u.id = ca.user_id WHERE ca.case_id = ?`, row.id,
    );
    const sections = json<string[]>(row.sections, []);
    const required = REQUIRED_DOCUMENTS[row.offence_category] ?? REQUIRED_DOCUMENTS.general!;
    const presentTypes = new Set(documents.map((d) => String(d.doc_type)));

    return {
      case: caseView(row),
      documents: documents.filter((d) => Number(d.is_current) === 1).map(documentView),
      allDocuments: documents.map(documentView),
      assignments,
      deadlines: deadlinesForCase(row.id),
      vault: vaultEntriesForCase(row.id),
      entities: all(
        `SELECT type, value, normalised, MAX(confidence) AS confidence, COUNT(*) AS mentions,
                MAX(verified) AS verified
         FROM entities WHERE case_id = ? GROUP BY type, normalised ORDER BY mentions DESC`, row.id,
      ),
      completeness: {
        required,
        present: required.filter((item) => presentTypes.has(item.docType)).map((item) => item.docType),
        missing: required.filter((item) => !presentTypes.has(item.docType)),
        percent: Math.round((required.filter((i) => presentTypes.has(i.docType)).length / required.length) * 100),
      },
      // Dates extracted from documents build the timeline automatically; the
      // officer corrects it rather than constructing it.
      timeline: [
        { at: row.registered_at, kind: 'case_registered', label: `Case ${row.case_number} registered`, ref: row.id },
        ...documents.map((d) => ({
          at: String(d.created_at), kind: 'document_sealed',
          label: `${d.title} sealed (v${d.version})`, ref: String(d.id),
        })),
        ...all<{ created_at: string; action: string; id: string; reason: string }>(
          'SELECT created_at, action, id, reason FROM custody_events WHERE case_id = ? AND action != ?', row.id, 'seal',
        ).map((e) => ({ at: e.created_at, kind: `custody_${e.action}`, label: e.reason, ref: e.id })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
      sectionsAssessment: assessSections(sections),
    };
  });

  app.post('/', async (request, reply) => {
    const user = request.user!;
    const body = (request.body ?? {}) as {
      caseNumber?: string; title?: string; sections?: string[]; station?: string; district?: string;
      victim?: { fullName: string; age?: number; address?: string; phone?: string };
    };
    if (!body.caseNumber || !body.title || !Array.isArray(body.sections)) {
      return reply.code(400).send(badRequest('caseNumber, title and sections[] are required'));
    }

    // Sensitivity escalation is automatic. No officer has to remember to do it.
    const assessment = assessSections(body.sections);
    const caseId = id('CASE');
    const registeredAt = now();
    const station = body.station ?? user.station ?? 'UNASSIGNED';
    const district = body.district ?? user.district;

    run(
      `INSERT INTO cases (id, case_number, title, station, district, sections, offence_category,
                          sensitivity, sensitive_mode, registered_at, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      caseId, body.caseNumber, body.title, station, district, JSON.stringify(body.sections),
      assessment.category, assessment.sensitivity, assessment.sensitive ? 1 : 0,
      registeredAt, user.id, registeredAt,
    );
    run(
      'INSERT INTO case_assignments (case_id, user_id, role, assigned_by, assigned_at) VALUES (?,?,?,?,?)',
      caseId, user.id, 'io', user.id, registeredAt,
    );

    if (assessment.sensitive) enableSensitiveMode(caseId, user.id, `Auto-escalated: ${assessment.matched.join('; ')}`);

    let vault: { vaultId: string; pseudonym: string } | null = null;
    if (body.victim && assessment.sensitive) {
      vault = sealIdentity(caseId, body.victim, 'victim');
    }
    const deadlinesCreated = createDeadlinesForCase(caseId, assessment.category, registeredAt);

    audit({
      actorId: user.id, actorLabel: user.full_name, action: 'case.create', outcome: 'allow',
      resourceType: 'case', resourceId: caseId, caseId, purposeCode: 'INVESTIGATION',
      detail: { sections: body.sections, assessment, deadlinesCreated },
    });

    return reply.code(201).send({
      case: caseView(loadCase(caseId)!),
      assessment,
      vault,
      deadlinesCreated,
      message: assessment.sensitive
        ? 'Case auto-escalated to Sensitive Case Mode. Rank alone no longer grants access; explicit assignment is required.'
        : 'Case registered.',
    });
  });

  app.post('/:caseId/assign', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const { userId, role } = (request.body ?? {}) as { userId?: string; role?: string };
    const row = loadCase(caseId);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if (!userId) return reply.code(400).send(badRequest('userId is required'));

    const check = authorise(request, {
      action: 'case.assign', resource: caseResource(row), purposeCode: 'SUPERVISION',
    });
    if (!check.allowed) return denyResponse(reply, check.decision);

    run(
      `INSERT INTO case_assignments (case_id, user_id, role, assigned_by, assigned_at) VALUES (?,?,?,?,?)
       ON CONFLICT(case_id, user_id) DO UPDATE SET role = excluded.role`,
      row.id, userId, role ?? 'observer', request.user!.id, now(),
    );
    return { caseId: row.id, userId, role: role ?? 'observer' };
  });

  app.get('/:caseId/deadlines', async (request, reply) => {
    const { caseId } = request.params as { caseId: string };
    const row = loadCase(caseId);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const check = authorise(request, { action: 'case.read', resource: caseResource(row), purposeCode: 'SUPERVISION' });
    if (!check.allowed) return denyResponse(reply, check.decision);
    return { deadlines: deadlinesForCase(row.id) };
  });

  /** Cross-case link analysis - NCRB's national pattern-detection mandate. */
  app.get('/links/cross-case', async (request) => {
    const links = crossCaseLinks(2);
    const enriched = links.map((link) => ({
      type: link.type,
      value: link.normalised,
      caseCount: link.case_count,
      cases: link.cases.split(',').map((caseId) => {
        const row = get<{ case_number: string; title: string; district: string }>(
          'SELECT case_number, title, district FROM cases WHERE id = ?', caseId,
        );
        return { id: caseId, caseNumber: row?.case_number ?? caseId, title: row?.title ?? '', district: row?.district ?? '' };
      }),
    }));
    audit({
      actorId: request.user!.id, actorLabel: request.user!.full_name, action: 'search.cross_case_links',
      outcome: 'allow', detail: { linksFound: enriched.length },
    });
    return { links: enriched };
  });
}
