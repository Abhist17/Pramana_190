/** The six on-chain contracts. Kept small on purpose — see contracts/. */
export type ContractName =
  | 'DocumentRegistry'
  | 'CustodyLedger'
  | 'AuditAnchor'
  | 'AccessPolicyRegistry'
  | 'SealedCustody'
  | 'RetentionRegistry';

export type AnchorKind = 'document' | 'custody' | 'audit_batch' | 'policy' | 'seal' | 'retention';

export type AnchorRequest = {
  kind: AnchorKind;
  contract: ContractName;
  method: string;
  /** The subject this anchor is about (document id, batch id, ...). Off-chain reference only. */
  subjectId: string;
  /**
   * Everything in here is written to the ledger, so it must contain NO personal
   * data, no case narrative and nothing from which content could be inferred.
   * Hashes, codes, counters and pseudonymous actor references only.
   * Enforced by assertNoPersonalData() in ledger/guard.ts.
   */
  payload: Record<string, string | number>;
  submittedBy: string;
};

export type AnchorReceipt = {
  anchorId: string;
  driver: 'local' | 'evm';
  chainId: string;
  txRef: string;
  blockNumber: number | null;
  blockHash: string | null;
  contract: ContractName;
  payloadHash: string;
  createdAt: string;
};

export interface LedgerDriver {
  readonly name: 'local' | 'evm';
  readonly chainId: string;
  submit(request: AnchorRequest): Promise<Omit<AnchorReceipt, 'anchorId' | 'createdAt'>>;
  /** Does the chain hold this exact payload hash? Backs the public verifier. */
  lookup(payloadHash: string): Promise<{ found: boolean; txRef?: string; blockNumber?: number | null }>;
  status(): Promise<Record<string, unknown>>;
}
