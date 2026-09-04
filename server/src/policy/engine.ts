import { all, get, run, now, json } from '../db/index.ts';
import { hashObject } from '../core/hash.ts';
import { id } from '../core/ids.ts';
import { anchor } from '../ledger/index.ts';
import { DEFAULT_POLICY } from './ruleset.ts';
import type { AccessRequest, Condition, Decision, PolicySet, Rule } from './types.ts';

export * from './types.ts';
export { DEFAULT_POLICY } from './ruleset.ts';

// ------------------------------------------------------------ policy store --

type PolicyRow = { id: string; version: number; rules: string; policy_hash: string };

let cached: { set: PolicySet; hash: string } | null = null;

export function activePolicy(): { set: PolicySet; hash: string } {
  if (cached) return cached;
  const row = get<PolicyRow>(
    'SELECT * FROM policies WHERE effective_to IS NULL ORDER BY version DESC LIMIT 1',
  );
  if (row) {
    cached = { set: json<PolicySet>(row.rules, DEFAULT_POLICY), hash: row.policy_hash };
  } else {
    cached = { set: DEFAULT_POLICY, hash: hashObject(DEFAULT_POLICY) };
  }
  return cached;
}

export function clearPolicyCache(): void {
  cached = null;
}

/**
 * Installs a policy version and anchors its hash with an effective-from time.
 * The anchor is the point: it lets us prove, in a hearing years later, which
 * rules governed a specific access on a specific day.
 */
export async function installPolicy(set: PolicySet, createdBy: string): Promise<{ policyHash: string }> {
  const policyHash = hashObject(set);
  const timestamp = now();
  run('UPDATE policies SET effective_to = ? WHERE effective_to IS NULL', timestamp);
  const policyId = id('POL');
  run(
    `INSERT INTO policies (id, version, rules, policy_hash, effective_from, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    policyId, set.version, JSON.stringify(set), policyHash, timestamp, createdBy, timestamp,
  );
  const receipt = await anchor({
    kind: 'policy',
    contract: 'AccessPolicyRegistry',
    method: 'registerPolicy',
    subjectId: policyId,
    payload: { policyHash, version: set.version, ruleCount: set.rules.length, effectiveFrom: timestamp },
    submittedBy: createdBy,
  });
  run('UPDATE policies SET anchor_id = ? WHERE id = ?', receipt.anchorId, policyId);
  clearPolicyCache();
  return { policyHash };
}

// -------------------------------------------------------------- evaluation --

function resolveAttribute(path: string, request: AccessRequest): unknown {
  const [root, ...rest] = path.split('.');
  const source =
    root === 'subject' ? request.subject
    : root === 'resource' ? request.resource
    : root === 'environment' ? request.environment
    : undefined;
  if (!source) return undefined;
  return rest.reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    source,
  );
}

/** `@subject.district` style references let one attribute be compared to another. */
function resolveValue(value: unknown, request: AccessRequest): unknown {
  return typeof value === 'string' && value.startsWith('@')
    ? resolveAttribute(value.slice(1), request)
    : value;
}

function evaluateCondition(condition: Condition, request: AccessRequest): boolean {
  const actual = resolveAttribute(condition.attr, request);

  // A switch over `op` lets TypeScript narrow the condition union, so the
  // value-carrying comparisons are statically distinct from the value-free ones.
  switch (condition.op) {
    case 'assigned':
    case 'notAssigned': {
      const caseId = typeof actual === 'string' ? actual : request.resource.caseId ?? request.resource.id;
      const isAssigned = Boolean(caseId && request.subject.assignments[caseId]);
      return condition.op === 'assigned' ? isAssigned : !isAssigned;
    }
    case 'truthy':
      return Boolean(actual);
    case 'falsy':
      return !actual;
    case 'in':
    case 'nin': {
      const expected = resolveValue(condition.value, request);
      const present = Array.isArray(expected) && expected.includes(actual as never);
      return condition.op === 'in' ? present : !present;
    }
    default: {
      const expected = resolveValue(condition.value, request);
      // A comparison against a missing attribute is never satisfied, so an absent
      // attribute can never accidentally satisfy a permit rule.
      if (actual === undefined || actual === null || expected === undefined || expected === null) return false;
      switch (condition.op) {
        case 'eq': return actual === expected;
        case 'ne': return actual !== expected;
        case 'gt': return (actual as number) > (expected as number);
        case 'gte': return (actual as number) >= (expected as number);
        case 'lt': return (actual as number) < (expected as number);
        case 'lte': return (actual as number) <= (expected as number);
        default: return false;
      }
    }
  }
}

function ruleMatches(rule: Rule, request: AccessRequest): boolean {
  const coversAction = rule.actions[0] === '*' || (rule.actions as string[]).includes(request.action);
  if (!coversAction) return false;
  return rule.when.every((condition) => evaluateCondition(condition, request));
}

/**
 * Deny-overrides evaluation with an implicit final deny.
 *
 * Order is: every deny rule first, then permits. Nothing is implicitly allowed -
 * there is no "admin sees everything" path and no role that can read a sealed
 * document alone.
 */
export function evaluate(request: AccessRequest): Decision {
  const { set, hash } = activePolicy();
  return evaluateWith(set, hash, request);
}

/**
 * The pure evaluator: a policy set in, a decision out, no database and no
 * ambient state. `evaluate` is the thin wrapper that supplies the currently
 * installed policy; tests and the simulator pin an explicit set instead.
 */
export function evaluateWith(set: PolicySet, hash: string, request: AccessRequest): Decision {
  const base = { policyVersion: set.version, policyHash: hash };

  for (const rule of set.rules) {
    if (rule.effect !== 'deny') continue;
    if (ruleMatches(rule, request)) {
      return {
        effect: 'deny',
        ruleId: rule.id,
        reason: rule.description,
        obligations: rule.obligations ?? [],
        ...base,
      };
    }
  }

  for (const rule of set.rules) {
    if (rule.effect !== 'permit') continue;
    if (ruleMatches(rule, request)) {
      return {
        effect: 'permit',
        ruleId: rule.id,
        reason: rule.description,
        obligations: rule.obligations ?? [],
        ...base,
      };
    }
  }

  return {
    effect: 'deny',
    ruleId: 'default-deny',
    reason: 'No policy rule permits this action. Access is denied by default.',
    obligations: [],
    ...base,
  };
}

/** Explains every rule that fired, for the policy-simulator screen in the UI. */
export function explain(request: AccessRequest) {
  const { set } = activePolicy();
  return set.rules
    .filter((rule) => rule.actions[0] === '*' || (rule.actions as string[]).includes(request.action))
    .map((rule) => ({
      id: rule.id,
      effect: rule.effect,
      description: rule.description,
      basis: rule.basis ?? null,
      matched: ruleMatches(rule, request),
      conditions: rule.when.map((condition) => ({
        expression: `${condition.attr} ${condition.op}${'value' in condition ? ` ${JSON.stringify(condition.value)}` : ''}`,
        satisfied: evaluateCondition(condition, request),
      })),
    }));
}

export function loadSubjectAssignments(userId: string): Record<string, string> {
  const rows = all<{ case_id: string; role: string }>(
    'SELECT case_id, role FROM case_assignments WHERE user_id = ?',
    userId,
  );
  return Object.fromEntries(rows.map((r) => [r.case_id, r.role]));
}
