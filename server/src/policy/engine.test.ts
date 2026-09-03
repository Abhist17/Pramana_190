import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWith, DEFAULT_POLICY } from './engine.ts';
import { hashObject } from '../core/hash.ts';
import type { AccessRequest, Subject, Resource } from './types.ts';

// Pinned to the shipped baseline policy so these assertions describe the rules
// themselves, not whatever happens to be installed in a developer's database.
const POLICY_HASH = hashObject(DEFAULT_POLICY);
const evaluate = (request: AccessRequest) => evaluateWith(DEFAULT_POLICY, POLICY_HASH, request);

const officer = (overrides: Partial<Subject> = {}): Subject => ({
  id: 'USR_IO', role: 'io', rankLevel: 3, unit: 'Civil Police', district: 'Nagpur Rural',
  station: 'Kalmeshwar PS', clearanceLevel: 3, isWomanOfficer: false, assignments: {}, ...overrides,
});

const doc = (overrides: Partial<Resource> = {}): Resource => ({
  type: 'document', id: 'DOC_1', caseId: 'CASE_1', district: 'Nagpur Rural',
  station: 'Kalmeshwar PS', sensitivity: 2, ...overrides,
});

const req = (subject: Subject, resource: Resource, action: AccessRequest['action'], env: Partial<AccessRequest['environment']> = {}): AccessRequest => ({
  subject, resource, action,
  environment: { purposeCode: 'INVESTIGATION', hour: 11, ip: '10.0.0.1', breakGlass: false, sharedWith: false, ...env },
});

describe('ABAC engine', () => {
  test('denies by default when no rule permits', () => {
    const decision = evaluate(req(officer(), doc(), 'document.read'));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'default-deny');
  });

  test('permits an explicitly assigned officer', () => {
    const decision = evaluate(req(officer({ assignments: { CASE_1: 'io' } }), doc(), 'document.read'));
    assert.equal(decision.effect, 'permit');
    assert.equal(decision.ruleId, 'permit-assigned-officer');
    assert.ok(decision.obligations.includes('watermark'));
  });

  test('rank alone does not open a sensitive case', () => {
    // A Superintendent (rank 6) with no assignment on a Women Safety case.
    const sp = officer({ id: 'USR_SP', rankLevel: 6, role: 'supervisor', station: null });
    const decision = evaluate(req(sp, doc({ sensitivity: 3, sensitiveMode: true }), 'document.read'));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-sensitive-case-without-assignment');
  });

  test('sealed cover is never readable directly, even by an assigned officer', () => {
    const assigned = officer({ assignments: { CASE_1: 'io' }, clearanceLevel: 4 });
    const decision = evaluate(req(assigned, doc({ sensitivity: 4, sealedCover: true }), 'document.read'));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-sealed-cover-direct-read');
  });

  test('clearance below sensitivity is refused', () => {
    const assigned = officer({ assignments: { CASE_1: 'io' }, clearanceLevel: 2 });
    const decision = evaluate(req(assigned, doc({ sensitivity: 3 }), 'document.read'));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-clearance-below-sensitivity');
  });

  test('a purpose code is mandatory for reads', () => {
    const assigned = officer({ assignments: { CASE_1: 'io' } });
    const decision = evaluate(req(assigned, doc(), 'document.read', { purposeCode: null }));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-missing-purpose');
  });

  test('break-glass permits, but carries obligations', () => {
    const decision = evaluate(req(officer(), doc(), 'document.read', { breakGlass: true, purposeCode: 'EMERGENCY' }));
    assert.equal(decision.effect, 'permit');
    assert.equal(decision.ruleId, 'permit-break-glass');
    for (const obligation of ['notify-two-supervisors', 'flag-in-case-audit', 'time-box-15min']) {
      assert.ok(decision.obligations.includes(obligation), `missing obligation ${obligation}`);
    }
  });

  test('break-glass does NOT open sealed cover', () => {
    const decision = evaluate(
      req(officer(), doc({ sealedCover: true, sensitivity: 4 }), 'document.read', { breakGlass: true }),
    );
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-sealed-cover-direct-read');
  });

  test('a prosecutor sees only what was shared with them', () => {
    const prosecutor = officer({ id: 'USR_PP', role: 'prosecutor', station: null });
    assert.equal(evaluate(req(prosecutor, doc(), 'document.read')).effect, 'deny');
    assert.equal(evaluate(req(prosecutor, doc(), 'document.read', { sharedWith: true })).effect, 'permit');
  });

  test('the CISO can read the audit trail but never case content', () => {
    const ciso = officer({ id: 'USR_SEC', role: 'ciso', rankLevel: 5, station: null, district: 'Mumbai' });
    assert.equal(evaluate(req(ciso, { type: 'audit', id: 'all', sensitivity: 1 }, 'audit.read')).effect, 'permit');
    const content = evaluate(req(ciso, doc(), 'document.read'));
    assert.equal(content.effect, 'deny', 'the CISO must not have a path to case content');
  });

  test('disposal is refused while a legal hold stands', () => {
    const records = officer({ id: 'USR_REC', role: 'records', rankLevel: 2, clearanceLevel: 1, station: null });
    const held = doc({ legalHold: true });
    const decision = evaluate(req(records, held, 'document.dispose', { purposeCode: 'RECORDS' }));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-dispose-under-legal-hold');
  });

  test('bulk export is barred on sensitive material', () => {
    const assigned = officer({ assignments: { CASE_1: 'io' } });
    const decision = evaluate(req(assigned, doc({ sensitivity: 3 }), 'bulk.export'));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-bulk-export-sensitive');
  });

  test('certifying a single sensitive record for court is still permitted', () => {
    const assigned = officer({ assignments: { CASE_1: 'io' }, clearanceLevel: 3 });
    const decision = evaluate(
      req(assigned, doc({ sensitivity: 3, sensitiveMode: true }), 'document.certify', { purposeCode: 'COURT_PRODUCTION' }),
    );
    assert.equal(decision.effect, 'permit');
  });

  test('an out-of-district officer without assignment is refused', () => {
    const outsider = officer({ district: 'Pune Rural', station: 'Baramati PS' });
    const decision = evaluate(req(outsider, doc(), 'document.read'));
    assert.equal(decision.effect, 'deny');
    assert.equal(decision.ruleId, 'deny-out-of-district');
  });
});
