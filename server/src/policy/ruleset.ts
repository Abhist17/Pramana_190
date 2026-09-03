import type { PolicySet } from './types.ts';

/**
 * The default PRAMANA access-policy set.
 *
 * Rules are data, not code: a change in the law becomes a policy edit and a new
 * anchored version, not a release. Evaluation is deny-overrides with an implicit
 * final deny, so an action nobody explicitly permitted is refused.
 *
 * The hash of this set is anchored on-chain (AccessPolicyRegistry) with its
 * effective period, which is what lets us prove years later what the access rules
 * actually were on the day of a given access — closing an argument the defence
 * would otherwise open.
 */
export const DEFAULT_POLICY: PolicySet = {
  version: 1,
  name: 'PRAMANA baseline policy',
  rules: [
    // ---------------------------------------------------------------- denies --
    {
      id: 'deny-sealed-cover-direct-read',
      effect: 'deny',
      description:
        'Level-4 sealed-cover material is never readable through ordinary access. It requires an m-of-n threshold unseal.',
      basis: 'Court sealed-cover directions; threshold custody',
      actions: ['document.read', 'document.download', 'document.print', 'document.export'],
      when: [{ attr: 'resource.sealedCover', op: 'truthy' }],
    },
    {
      id: 'deny-clearance-below-sensitivity',
      effect: 'deny',
      description: 'A subject may never read material above their clearance level.',
      basis: 'Departmental classification policy',
      // Scoped to actions that expose content. Disposal, custody transfer and
      // retention actions are governed by their own rules: a record-room clerk
      // lawfully destroys material they were never cleared to read.
      actions: [
        'document.read', 'document.download', 'document.print', 'document.export',
        'document.certify', 'document.share', 'document.redact', 'document.version',
        'document.sign', 'case.read', 'bulk.export',
      ],
      when: [{ attr: 'subject.clearanceLevel', op: 'lt', value: '@resource.sensitivity' }],
    },
    {
      id: 'deny-sensitive-case-without-assignment',
      effect: 'deny',
      description:
        'In a Women Safety (sensitive) case, rank alone grants nothing. Access requires explicit case assignment — a Superintendent who is not assigned gets a request button, not the file.',
      basis: 'BNS victim-identity provisions; POCSO; Nipun Saxena directions',
      actions: ['case.read', 'document.read', 'document.download', 'document.print', 'document.export'],
      when: [
        { attr: 'resource.sensitiveMode', op: 'truthy' },
        { attr: 'resource.caseId', op: 'notAssigned' },
      ],
    },
    {
      id: 'deny-bulk-export-sensitive',
      effect: 'deny',
      description: 'Bulk export and print are disabled by default on sensitive cases.',
      basis: 'Women Safety Division handling standard',
      actions: ['bulk.export', 'document.export'],
      when: [{ attr: 'resource.sensitivity', op: 'gte', value: 3 }],
    },
    {
      id: 'deny-out-of-district',
      effect: 'deny',
      description:
        'Material stays inside its district unless the subject is assigned to the case or holds a state-level posting.',
      basis: 'Jurisdiction',
      actions: ['document.read', 'document.download', 'case.read'],
      when: [
        { attr: 'subject.district', op: 'ne', value: '@resource.district' },
        { attr: 'subject.rankLevel', op: 'lt', value: 6 },
        { attr: 'resource.caseId', op: 'notAssigned' },
      ],
    },
    {
      id: 'deny-dispose-under-legal-hold',
      effect: 'deny',
      description: 'A legal hold overrides the retention schedule; disposal is refused while it stands.',
      basis: 'Public Records Act; pending appeal / court order',
      actions: ['document.dispose'],
      when: [{ attr: 'resource.legalHold', op: 'truthy' }],
    },
    {
      id: 'deny-missing-purpose',
      effect: 'deny',
      description:
        'You do not simply open a document; you open it for a reason drawn from a controlled vocabulary. The reason is stored with the audit event and is anomaly-scored.',
      basis: 'DPDP Act purpose limitation',
      actions: ['document.read', 'document.download', 'document.print', 'document.export'],
      when: [{ attr: 'environment.purposeCode', op: 'falsy' }],
    },

    // --------------------------------------------------------------- permits --
    {
      id: 'permit-break-glass',
      effect: 'permit',
      description:
        'Emergency override. Time-boxed, requires a written justification, notifies two supervisors immediately and is permanently flagged in the case audit view. Emergency access is possible and uncomfortable.',
      basis: 'Operational necessity',
      actions: ['case.read', 'document.read'],
      when: [
        { attr: 'environment.breakGlass', op: 'truthy' },
        { attr: 'resource.sealedCover', op: 'falsy' },
      ],
      obligations: ['watermark', 'notify-two-supervisors', 'flag-in-case-audit', 'time-box-15min', 'ciso-alert'],
    },
    {
      id: 'permit-assigned-officer',
      effect: 'permit',
      description: 'An officer explicitly assigned to a case may work on it.',
      actions: [
        'case.read', 'case.write', 'document.read', 'document.download', 'document.create',
        'document.version', 'document.sign', 'document.print', 'document.redact',
        'document.certify', 'document.share', 'custody.transfer',
        // An officer may read the audit trail OF A CASE THEY ARE ASSIGNED TO —
        // "who else opened my file" is a legitimate and useful question. The
        // unscoped, station-wide trail stays with oversight roles, because this
        // rule only matches when the request names a case they hold.
        'audit.read',
      ],
      when: [{ attr: 'resource.caseId', op: 'assigned' }],
      obligations: ['watermark'],
    },
    {
      id: 'permit-station-supervisor',
      effect: 'permit',
      description:
        'An SHO or above may see non-sensitive cases in their own station without individual assignment.',
      actions: ['case.read', 'document.read', 'audit.read'],
      when: [
        { attr: 'subject.rankLevel', op: 'gte', value: 4 },
        { attr: 'subject.station', op: 'eq', value: '@resource.station' },
        { attr: 'resource.sensitivity', op: 'lte', value: 2 },
      ],
      obligations: ['watermark'],
    },
    {
      id: 'permit-district-supervisor',
      effect: 'permit',
      description: 'A DSP or above may review non-sensitive cases across their district.',
      actions: ['case.read', 'document.read', 'audit.read'],
      when: [
        { attr: 'subject.rankLevel', op: 'gte', value: 5 },
        { attr: 'subject.district', op: 'eq', value: '@resource.district' },
        { attr: 'resource.sensitivity', op: 'lte', value: 2 },
      ],
      obligations: ['watermark'],
    },
    {
      id: 'permit-prosecutor-scoped-share',
      effect: 'permit',
      description:
        'A prosecutor sees exactly what was shared with them, for the period it was shared, for the stated purpose.',
      actions: ['case.read', 'document.read', 'document.download', 'document.certify'],
      when: [
        { attr: 'subject.role', op: 'eq', value: 'prosecutor' },
        { attr: 'environment.sharedWith', op: 'truthy' },
      ],
      obligations: ['watermark', 'expire-on-schedule'],
    },
    {
      id: 'permit-fsl-scoped-share',
      effect: 'permit',
      description: 'A forensic officer sees material referred to them for examination.',
      actions: ['case.read', 'document.read', 'document.download', 'document.create', 'custody.transfer'],
      when: [
        { attr: 'subject.role', op: 'eq', value: 'fsl' },
        { attr: 'environment.sharedWith', op: 'truthy' },
      ],
      obligations: ['watermark'],
    },
    {
      id: 'permit-court-scoped-share',
      effect: 'permit',
      description: 'Court staff receive sealed electronic bundles filed with them.',
      actions: ['case.read', 'document.read', 'document.download', 'seal.approve'],
      when: [
        { attr: 'subject.role', op: 'eq', value: 'court' },
        { attr: 'environment.sharedWith', op: 'truthy' },
      ],
      obligations: ['watermark'],
    },
    {
      id: 'permit-ciso-audit',
      effect: 'permit',
      description:
        'The CISO reads the audit trail — and only the audit trail. Note there is no rule anywhere granting an administrator access to case content.',
      basis: 'CERT-In directions; departmental security oversight',
      actions: ['audit.read', 'admin.policy'],
      when: [{ attr: 'subject.role', op: 'in', value: ['ciso', 'admin'] }],
    },
    {
      id: 'permit-records-retention',
      effect: 'permit',
      description: 'Record-room staff act on the retention schedule without reading case content.',
      actions: ['document.dispose', 'case.read'],
      when: [
        { attr: 'subject.role', op: 'eq', value: 'records' },
        { attr: 'environment.purposeCode', op: 'eq', value: 'RECORDS' },
      ],
    },
    {
      id: 'permit-vault-deanonymise-request',
      effect: 'permit',
      description:
        'An assigned officer may *request* de-anonymisation. The request itself grants nothing — it needs dual authorisation and a waiting period.',
      actions: ['vault.deanonymise', 'seal.request'],
      when: [{ attr: 'resource.caseId', op: 'assigned' }],
      obligations: ['dual-authorisation', 'notify-supervisor', 'anchor-event'],
    },
  ],
};
