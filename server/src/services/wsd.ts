import { get, all, run, now, json } from '../db/index.ts';
import { encrypt, decrypt, generateKey, wrapKey, unwrapKey, type WrappedKey } from '../core/envelope.ts';
import { id, pseudonym } from '../core/ids.ts';
import { masterKey } from './keys.ts';
import { record as audit } from './audit.ts';
import { anchor } from '../ledger/index.ts';
import { config } from '../config.ts';

/**
 * Women Safety Division module.
 *
 * The problem statement is sponsored by the Women Safety Division, not NCRB
 * generally. That division owns the systems around sexual offences, offences
 * against children, trafficking and victim protection — the most sensitive class
 * of case file in Indian policing, carrying legal obligations no generic DMS
 * satisfies.
 *
 * Two ideas do the work here:
 *   1. Sensitive Case Mode is automatic. No officer has to remember to enable it.
 *   2. The victim's identity is never in the working documents at all.
 */

// -------------------------------------------------------- sensitive mode --

/**
 * Offence sections that automatically escalate a case to sensitivity 3+.
 * [VERIFY every section against indiacode.nic.in before submission.]
 */
export const SENSITIVE_SECTIONS: { pattern: RegExp; category: string; label: string }[] = [
  { pattern: /\bBNS\s*6[34]\b|\bIPC\s*376\b/i, category: 'sexual_offence', label: 'Rape' },
  { pattern: /\bBNS\s*7[45]\b|\bIPC\s*354\b/i, category: 'sexual_offence', label: 'Assault with intent to outrage modesty' },
  { pattern: /\bBNS\s*79\b|\bIPC\s*509\b/i, category: 'sexual_offence', label: 'Word or gesture insulting modesty' },
  { pattern: /\bPOCSO\b/i, category: 'pocso', label: 'Protection of Children from Sexual Offences' },
  { pattern: /\bBNS\s*143\b|\bIPC\s*370\b/i, category: 'trafficking', label: 'Trafficking of persons' },
  { pattern: /\bBNS\s*85\b|\bIPC\s*498A\b/i, category: 'domestic_violence', label: 'Cruelty by husband or relative' },
  { pattern: /\bBNS\s*80\b|\bIPC\s*304B\b/i, category: 'domestic_violence', label: 'Dowry death' },
];

export type SensitivityAssessment = {
  sensitive: boolean;
  category: string;
  sensitivity: number;
  matched: string[];
};

/**
 * Errors fail towards protection: this classifier may RAISE a case's sensitivity
 * automatically, but only a human with senior approval may lower it.
 */
export function assessSections(sections: string[]): SensitivityAssessment {
  const matched: string[] = [];
  let category = 'general';
  for (const section of sections) {
    for (const rule of SENSITIVE_SECTIONS) {
      if (rule.pattern.test(section)) {
        matched.push(`${section} — ${rule.label}`);
        if (category === 'general' || rule.category === 'pocso') category = rule.category;
      }
    }
  }
  return {
    sensitive: matched.length > 0,
    category,
    sensitivity: matched.length > 0 ? 3 : 2,
    matched,
  };
}

export function enableSensitiveMode(caseId: string, actorId: string, reason: string) {
  run('UPDATE cases SET sensitive_mode = 1, sensitivity = MAX(sensitivity, 3) WHERE id = ?', caseId);
  run('UPDATE documents SET sensitivity = MAX(sensitivity, 3) WHERE case_id = ?', caseId);
  audit({
    actorId, actorLabel: actorId, action: 'case.sensitive_mode_enabled', outcome: 'allow',
    resourceType: 'case', resourceId: caseId, caseId, detail: { reason },
  });
}

/** De-escalation is deliberately harder than escalation and always leaves a record. */
export function disableSensitiveMode(caseId: string, actorId: string, actorRank: number, reason: string) {
  if (actorRank < 5) {
    throw new Error('de-escalating a sensitive case requires an officer of DSP rank or above');
  }
  run('UPDATE cases SET sensitive_mode = 0 WHERE id = ?', caseId);
  audit({
    actorId, actorLabel: actorId, action: 'case.sensitive_mode_disabled', outcome: 'allow',
    resourceType: 'case', resourceId: caseId, caseId, reason, detail: { actorRank, reason },
  });
}

// ------------------------------------------------- victim identity vault --

export type VaultRecord = {
  fullName: string;
  age?: number;
  address?: string;
  phone?: string;
  guardianName?: string;
  notes?: string;
};

/**
 * The design decision that makes this module real: the victim's identifying
 * particulars are never stored in the working documents. They live in a
 * separately encrypted vault, and every document, index entry, search result,
 * notification and export refers to the victim by a stable pseudonym.
 *
 * Compliance today depends on individual officers remembering to be careful with
 * a name written in plain text across forty documents. Here it is structural:
 * an officer cannot leak what the system never showed him.
 */
export function sealIdentity(caseId: string, subject: VaultRecord, kind: 'victim' | 'protected_witness' | 'source' = 'victim') {
  const vaultId = id('VLT');
  const alias = pseudonym(kind === 'victim' ? 'VICTIM' : kind === 'source' ? 'SOURCE' : 'WITNESS');
  const dataKey = generateKey();
  const sealed = encrypt(Buffer.from(JSON.stringify(subject), 'utf8'), dataKey, Buffer.from(vaultId));
  run(
    `INSERT INTO victim_vault (id, case_id, pseudonym, subject_kind, ciphertext, iv, auth_tag, wrapped_key, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    vaultId, caseId, alias, kind, sealed.data.toString('hex'), sealed.iv, sealed.authTag,
    JSON.stringify(wrapKey(dataKey, masterKey())), now(),
  );
  if (kind === 'victim') run('UPDATE cases SET victim_pseudonym = ? WHERE id = ?', alias, caseId);
  return { vaultId, pseudonym: alias };
}

export function vaultEntriesForCase(caseId: string) {
  // Note what this does NOT return: the ciphertext. Listing protected subjects is
  // an ordinary operation; reading one never is.
  return all<{ id: string; pseudonym: string; subject_kind: string; created_at: string }>(
    'SELECT id, pseudonym, subject_kind, created_at FROM victim_vault WHERE case_id = ?',
    caseId,
  );
}

/**
 * De-anonymisation is a distinct, privileged operation — never a side effect of
 * opening a document. It requires dual authorisation, a recorded justification, a
 * waiting period during which every custodian is notified, and it is anchored
 * on-chain as a first-class event separate from ordinary document access.
 */
export async function requestDeanonymisation(vaultId: string, requestedBy: string, reason: string) {
  const vault = get<{ id: string; case_id: string }>('SELECT id, case_id FROM victim_vault WHERE id = ?', vaultId);
  if (!vault) throw new Error('vault entry not found');
  if (reason.trim().length < 20) {
    throw new Error('a substantive written justification (at least 20 characters) is required');
  }

  const requestId = id('VRQ');
  const requestedAt = now();
  const availableAt = new Date(Date.now() + config.sealWaitingPeriodMs).toISOString();
  run(
    `INSERT INTO vault_requests (id, vault_id, case_id, requested_by, reason, requested_at, available_at)
     VALUES (?,?,?,?,?,?,?)`,
    requestId, vaultId, vault.case_id, requestedBy, reason, requestedAt, availableAt,
  );

  run(
    `INSERT INTO alerts (id, kind, severity, title, detail, actor_id, case_id, created_at)
     VALUES (?, 'vault_deanonymisation_requested', 'high', ?, ?, ?, ?, ?)`,
    id('ALR'), 'Victim identity de-anonymisation requested',
    JSON.stringify({ requestId, vaultId, reason, availableAt }), requestedBy, vault.case_id, requestedAt,
  );

  await anchor({
    kind: 'seal', contract: 'SealedCustody', method: 'requestUnseal', subjectId: requestId,
    payload: { vaultRef: vaultId, requestedAt, availableAt, requiredApprovals: 2 },
    submittedBy: requestedBy,
  });

  audit({
    actorId: requestedBy, actorLabel: requestedBy, action: 'vault.deanonymise_request', outcome: 'allow',
    resourceType: 'vault', resourceId: vaultId, caseId: vault.case_id, reason,
    detail: { requestId, availableAt },
  });

  return { requestId, availableAt, requiredApprovals: 2 };
}

export function approveDeanonymisation(requestId: string, approverId: string, approverRank: number) {
  const request = get<{ id: string; vault_id: string; case_id: string; requested_by: string; approvals: string; required_approvals: number; status: string }>(
    'SELECT * FROM vault_requests WHERE id = ?', requestId,
  );
  if (!request) throw new Error('request not found');
  if (request.status !== 'pending') throw new Error(`request is already ${request.status}`);
  if (approverId === request.requested_by) throw new Error('the requesting officer cannot approve their own request');
  if (approverRank < 5) throw new Error('approval requires an officer of DSP rank or above');

  const approvals = json<string[]>(request.approvals, []);
  if (approvals.includes(approverId)) throw new Error('this officer has already approved');
  approvals.push(approverId);
  const satisfied = approvals.length >= request.required_approvals;
  run(
    'UPDATE vault_requests SET approvals = ?, status = ? WHERE id = ?',
    JSON.stringify(approvals), satisfied ? 'approved' : 'pending', requestId,
  );
  audit({
    actorId: approverId, actorLabel: approverId, action: 'vault.deanonymise_approve', outcome: 'allow',
    resourceType: 'vault', resourceId: request.vault_id, caseId: request.case_id,
    detail: { requestId, approvals: approvals.length, required: request.required_approvals },
  });
  return { requestId, approvals: approvals.length, required: request.required_approvals, status: satisfied ? 'approved' : 'pending' };
}

export function revealIdentity(requestId: string, actorId: string): { pseudonym: string; subject: VaultRecord } {
  const request = get<{ id: string; vault_id: string; case_id: string; status: string; available_at: string; requested_by: string }>(
    'SELECT * FROM vault_requests WHERE id = ?', requestId,
  );
  if (!request) throw new Error('request not found');
  if (request.status !== 'approved') throw new Error('request has not received the required approvals');
  if (new Date() < new Date(request.available_at)) {
    throw new Error(`the waiting period has not elapsed; available at ${request.available_at}`);
  }
  if (actorId !== request.requested_by) throw new Error('only the requesting officer may open the reveal');

  const vault = get<{ pseudonym: string; ciphertext: string; iv: string; auth_tag: string; wrapped_key: string; id: string }>(
    'SELECT * FROM victim_vault WHERE id = ?', request.vault_id,
  );
  if (!vault) throw new Error('vault entry not found');

  const dataKey = unwrapKey(JSON.parse(vault.wrapped_key) as WrappedKey, masterKey());
  const plaintext = decrypt(
    { data: Buffer.from(vault.ciphertext, 'hex'), iv: vault.iv, authTag: vault.auth_tag },
    dataKey, Buffer.from(vault.id),
  );

  run("UPDATE vault_requests SET status = 'fulfilled', resolved_at = ? WHERE id = ?", now(), requestId);
  audit({
    actorId, actorLabel: actorId, action: 'vault.deanonymise_reveal', outcome: 'allow',
    resourceType: 'vault', resourceId: vault.id, caseId: request.case_id,
    detail: { requestId, pseudonym: vault.pseudonym },
  });

  return { pseudonym: vault.pseudonym, subject: JSON.parse(plaintext.toString('utf8')) as VaultRecord };
}

export function pendingVaultRequests(caseId?: string) {
  return caseId
    ? all('SELECT * FROM vault_requests WHERE case_id = ? ORDER BY requested_at DESC', caseId)
    : all('SELECT * FROM vault_requests ORDER BY requested_at DESC LIMIT 50');
}

/**
 * Statutory role enforcement: where the law requires a particular officer to
 * perform a particular act — statements of women and child victims being recorded
 * by a woman officer — the system enforces it at the point of upload rather than
 * finding it in an audit months later.
 */
export const WOMAN_OFFICER_REQUIRED_TYPES = ['victim_statement', 'victim_statement_164', 'medical_consent'];

export function checkWomanOfficerRequirement(docType: string, isWomanOfficer: boolean, sensitiveMode: boolean) {
  const required = sensitiveMode && WOMAN_OFFICER_REQUIRED_TYPES.includes(docType);
  return {
    required,
    satisfied: !required || isWomanOfficer,
    basis: 'BNSS s.176(1) proviso / s.183 / POCSO s.24 [VERIFY]',
    message: required && !isWomanOfficer
      ? 'This statement class must be recorded by a woman police officer. The upload is blocked and the attempt has been logged.'
      : null,
  };
}
