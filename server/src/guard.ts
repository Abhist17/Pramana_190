import type { FastifyReply, FastifyRequest } from 'fastify';
import { get } from './db/index.ts';
import { verifyToken, loadUser, toSubject, type UserRow } from './auth.ts';
import { evaluate, type Action, type Decision, type Resource, type Subject } from './policy/engine.ts';
import { record as audit } from './services/audit.ts';
import { evaluateActor } from './services/anomaly.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow;
    subject?: Subject;
  }
}

export function authenticate(request: FastifyRequest, reply: FastifyReply): UserRow | null {
  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = token ? verifyToken(token) : null;
  const user = claims ? loadUser(claims.sub) : undefined;
  if (!user) {
    reply.code(401).send({ error: 'unauthenticated', message: 'A valid session token is required.' });
    return null;
  }
  request.user = user;
  request.subject = toSubject(user);
  return user;
}

export type GuardOptions = {
  action: Action;
  resource: Resource;
  purposeCode?: string | null;
  breakGlass?: boolean;
  breakGlassJustification?: string;
  /** extra context stored on the audit event */
  detail?: Record<string, unknown>;
};

export type GuardResult = { allowed: true; decision: Decision } | { allowed: false; decision: Decision };

function hasActiveShare(userId: string, resource: Resource): boolean {
  if (!resource.caseId) return false;
  const row = get<{ id: string; document_ids: string }>(
    `SELECT id, document_ids FROM shares
     WHERE case_id = ? AND grantee_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')`,
    resource.caseId, userId,
  );
  if (!row) return false;
  if (resource.type !== 'document') return true;
  const scoped = JSON.parse(row.document_ids) as string[];
  // An empty scope means the whole case was shared; otherwise it is exact.
  return scoped.length === 0 || scoped.includes(resource.id);
}

/**
 * Single choke point for access.
 *
 * Every read of a case or document goes through here: the policy engine decides,
 * the audit log records the decision either way (a denial is at least as
 * interesting as a grant), and the behavioural detector re-scores the actor.
 *
 * Denials are deliberately informative to the user about *why* - the rule id and
 * its description - because an access control nobody understands gets worked
 * around rather than followed.
 */
export function authorise(request: FastifyRequest, options: GuardOptions): GuardResult {
  const subject = request.subject!;
  const decision = evaluate({
    subject,
    resource: options.resource,
    action: options.action,
    environment: {
      purposeCode: options.purposeCode ?? null,
      hour: new Date().getHours(),
      ip: request.ip ?? null,
      breakGlass: options.breakGlass ?? false,
      breakGlassJustification: options.breakGlassJustification,
      sharedWith: hasActiveShare(subject.id, options.resource),
    },
  });

  audit({
    actorId: subject.id,
    actorLabel: request.user!.full_name,
    action: options.action,
    outcome: decision.effect === 'permit' ? 'allow' : 'deny',
    resourceType: options.resource.type,
    resourceId: options.resource.id,
    caseId: options.resource.caseId ?? null,
    purposeCode: options.purposeCode ?? null,
    reason: decision.reason,
    ip: request.ip ?? null,
    detail: {
      ruleId: decision.ruleId,
      policyVersion: decision.policyVersion,
      policyHash: decision.policyHash,
      obligations: decision.obligations,
      breakGlass: options.breakGlass ?? false,
      ...options.detail,
    },
  });

  // Anomaly scoring runs on the same event stream the audit log writes to, so it
  // sees denials and grants alike.
  evaluateActor(subject.id);

  return decision.effect === 'permit' ? { allowed: true, decision } : { allowed: false, decision };
}

export function denyResponse(reply: FastifyReply, decision: Decision) {
  return reply.code(403).send({
    error: 'access_denied',
    ruleId: decision.ruleId,
    reason: decision.reason,
    policyVersion: decision.policyVersion,
    policyHash: decision.policyHash,
    message: 'This access was denied and the denial has been recorded in the audit trail.',
  });
}

/**
 * Watermark text stamped on every view and download of a permitted document.
 * If a photographed screen appears on social media, the leak is attributable to
 * an individual. Deterrence is the feature; attribution is the mechanism.
 */
export function watermark(user: UserRow, caseNumber: string): string {
  return `${user.full_name} · ${user.designation} · ${caseNumber} · ${new Date().toISOString()} · PRAMANA`;
}
