export type Action =
  | 'case.read' | 'case.write' | 'case.assign'
  | 'document.read' | 'document.download' | 'document.print' | 'document.create'
  | 'document.version' | 'document.sign' | 'document.export' | 'document.redact'
  // Producing one record for court, and sharing one record with a named party,
  // are ordinary investigative acts. Bulk export is not. Keeping them as separate
  // actions means the sensitive-case export bar does not have to be bypassed at
  // the call site to let an officer file a charge sheet.
  | 'document.certify' | 'document.share'
  | 'document.dispose'
  | 'custody.transfer'
  | 'audit.read'
  | 'vault.deanonymise'
  | 'seal.request' | 'seal.approve'
  | 'bulk.export'
  | 'admin.policy';

export type Subject = {
  id: string;
  role: string;
  rankLevel: number;
  unit: string;
  district: string;
  station: string | null;
  clearanceLevel: number;
  isWomanOfficer: boolean;
  /** case ids this subject is explicitly assigned to, with their role on each */
  assignments: Record<string, string>;
};

export type Resource = {
  type: 'case' | 'document' | 'audit' | 'vault' | 'system';
  id: string;
  caseId?: string;
  district?: string;
  station?: string;
  sensitivity: number;
  sensitiveMode?: boolean;
  sealedCover?: boolean;
  docClass?: string;
  docType?: string;
  ownerId?: string;
  legalHold?: boolean;
};

export type Environment = {
  purposeCode: string | null;
  /** local hour 0-23, used by the off-hours rule */
  hour: number;
  ip: string | null;
  breakGlass: boolean;
  breakGlassJustification?: string;
  /** active, non-expired scoped share grants covering this resource */
  sharedWith: boolean;
};

export type AccessRequest = {
  subject: Subject;
  resource: Resource;
  action: Action;
  environment: Environment;
};

export type Decision = {
  effect: 'permit' | 'deny';
  /** rule that decided it - always populated, including for the default deny */
  ruleId: string;
  reason: string;
  obligations: string[];
  policyVersion: number;
  policyHash: string;
};

/**
 * A condition compares one attribute of the request against a literal, or -
 * when `value` starts with `@` - against another attribute of the same request
 * (e.g. `subject.clearanceLevel < @resource.sensitivity`).
 */
export type Condition =
  | { attr: string; op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: string | number | boolean }
  | { attr: string; op: 'in' | 'nin'; value: (string | number)[] }
  | { attr: string; op: 'assigned' | 'notAssigned' }
  | { attr: string; op: 'truthy' | 'falsy' };

export type Rule = {
  id: string;
  effect: 'permit' | 'deny';
  description: string;
  /** statutory or policy basis, shown to the user when a rule fires */
  basis?: string;
  actions: Action[] | ['*'];
  when: Condition[];
  /** side conditions the caller must honour if this rule permits (watermark, log, notify) */
  obligations?: string[];
};

export type PolicySet = {
  version: number;
  name: string;
  rules: Rule[];
};

export const PURPOSE_CODES: Record<string, string> = {
  INVESTIGATION: 'Active investigation of an assigned case',
  SUPERVISION: 'Supervisory review of a subordinate officer’s case',
  PROSECUTION: 'Preparation or conduct of prosecution',
  COURT_PRODUCTION: 'Production of material before a court',
  FORENSIC_EXAM: 'Forensic examination or report preparation',
  DISCLOSURE: 'Statutory supply of copies to accused or victim',
  RTI: 'Response to a Right to Information application',
  AUDIT: 'Compliance, audit or oversight review',
  RECORDS: 'Record-room retention, transfer or disposal action',
  EMERGENCY: 'Break-glass emergency access',
};
