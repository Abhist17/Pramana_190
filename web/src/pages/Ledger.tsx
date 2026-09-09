import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { denialMessage } from '../lib/app.tsx';
import { Card, Chip, Banner, Loading, Empty } from '../components/ui.tsx';
import { when, shortHash } from '../lib/format.ts';

type Status = {
  driver: string; chainId: string; height: number; headHash?: string; chainIntact?: boolean;
  brokenAtBlock?: number | null; validators?: string[]; consensus?: string; note?: string;
  contracts?: Record<string, string>; rpcUrl?: string;
  blocks: { number: number; prev_hash: string; block_hash: string; tx_root: string; timestamp: string }[];
  anchorsByKind: { kind: string; n: number }[];
  recentAnchors: { id: string; kind: string; subject_id: string; payload_hash: string; contract: string;
                   tx_ref: string; block_number: number | null; created_at: string; payload: string }[];
};

const CONTRACTS = [
  ['DocumentRegistry', 'Anchors document fingerprints; maintains version chains'],
  ['CustodyLedger', 'Records signed custody transfers for documents and physical exhibits'],
  ['AuditAnchor', 'Accepts periodic Merkle roots of audit batches'],
  ['AccessPolicyRegistry', 'Anchors the hash of each policy version with its effective period'],
  ['SealedCustody', 'Threshold unseal requests, guardian approvals, waiting-period enforcement'],
  ['RetentionRegistry', 'Legal holds, disposal authorisations, destruction certificates'],
];

export default function Ledger() {
  const [status, setStatus] = useState<Status | null>(null);

  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.get<Status>('/security/ledger/status').then(setStatus)
      .catch((caught) => setError(denialMessage(caught)?.body || String(caught)));
  }, []);
  useEffect(load, [load]);
  if (!status) return <Loading what="Reading the ledger" error={error} onRetry={load} />;

  return (
    <div className="stack">
      <div>
        <h1>Consortium ledger</h1>
        <div className="muted small">{status.consensus} · {status.chainId}</div>
      </div>

      <Banner tone={status.chainIntact === false ? 'danger' : 'info'}
              title={status.chainIntact === false
                ? `Chain integrity BROKEN at block ${status.brokenAtBlock}`
                : 'The chain stores proof, never content'}>
        Document fingerprints, custody events, audit-batch roots and policy hashes go on chain. Case
        content, names, addresses and narratives never do - a guard rejects any anchor whose payload
        looks like personal data, because an on-chain leak cannot be deleted.
        {status.note && <div className="tiny" style={{ marginTop: 7, opacity: .85 }}>{status.note}</div>}
      </Banner>

      <div className="grid c4">
        <Card title="Height"><div style={{ fontSize: 26, fontWeight: 700 }}>{status.height}</div>
          <div className="tiny muted">blocks</div></Card>
        <Card title="Driver"><div style={{ fontSize: 20, fontWeight: 700 }}>
          <Chip tone={status.driver === 'evm' ? 'ok' : 'a'}>{status.driver}</Chip></div>
          <div className="tiny muted">{status.driver === 'evm' ? status.rpcUrl : 'embedded consortium ledger'}</div></Card>
        <Card title="Chain integrity">
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {status.chainIntact === false ? <Chip tone="danger">BROKEN</Chip> : <Chip tone="ok">intact</Chip>}
          </div>
          <div className="tiny muted">every link re-derived on read</div></Card>
        <Card title="Anchors">
          <div style={{ fontSize: 26, fontWeight: 700 }}>
            {status.anchorsByKind.reduce((sum, row) => sum + row.n, 0)}
          </div>
          <div className="tiny muted">{status.anchorsByKind.map((row) => `${row.kind} ${row.n}`).join(' · ')}</div></Card>
      </div>

      <div className="grid split">
        <Card title="Recent blocks" sub="Each block's hash commits to the one before it" tight>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Block hash</th><th>Previous</th><th>Sealed</th></tr></thead>
              <tbody>
                {status.blocks.map((block) => (
                  <tr key={block.number}>
                    <td className="num">{block.number}</td>
                    <td className="hash">{shortHash(block.block_hash, 16, 6)}</td>
                    <td className="hash muted">{shortHash(block.prev_hash, 12, 4)}</td>
                    <td className="small">{when(block.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack">
          {status.validators && (
            <Card title="Validator set" sub="Independent institutions, none reporting to another">
              <div className="stack" style={{ gap: 7 }}>
                {status.validators.map((validator) => (
                  <div key={validator} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="small" style={{ fontWeight: 600 }}>{validator}</span>
                    <Chip tone="ok"><span className="dot" />attesting</Chip>
                  </div>
                ))}
              </div>
              <div className="tiny muted" style={{ marginTop: 10 }}>
                This is the trust argument: the bodies with an incentive to alter a record are checked by
                bodies with an incentive to catch them. A 5-node QBFT set finalises with a 4-of-5 quorum.
              </div>
            </Card>
          )}

          <Card title="Contract set" sub="Small on purpose - a judge may ask to read them">
            <div className="stack" style={{ gap: 9 }}>
              {CONTRACTS.map(([name, purpose]) => (
                <div key={name}>
                  <div className="row" style={{ gap: 7 }}>
                    <span className="mono small" style={{ fontWeight: 650 }}>{name}</span>
                    {status.contracts?.[name] && <Chip tone="ok">deployed</Chip>}
                  </div>
                  <div className="tiny muted">{purpose}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Recent anchors" sub="Inspect exactly what was written - confirm for yourself that no content is there" tight>
        {status.recentAnchors.length === 0 ? <Empty>No anchors yet.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Kind</th><th>Contract</th><th>Payload written on chain</th><th>Block</th><th>When</th></tr></thead>
              <tbody>
                {status.recentAnchors.map((anchor) => (
                  <tr key={anchor.id}>
                    <td><Chip tone="a">{anchor.kind}</Chip></td>
                    <td className="mono small">{anchor.contract}</td>
                    <td className="mono tiny" style={{ maxWidth: 480, wordBreak: 'break-all' }}>{anchor.payload}</td>
                    <td className="num">{anchor.block_number ?? '-'}</td>
                    <td className="small">{when(anchor.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
