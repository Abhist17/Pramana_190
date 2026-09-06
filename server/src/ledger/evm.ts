import { hashObject } from '../core/hash.ts';
import { config } from '../config.ts';
import type { AnchorRequest, ContractName, LedgerDriver } from './types.ts';

/**
 * Permissioned EVM driver.
 *
 * Talks to the QBFT/IBFT network the contracts in contracts/ are deployed to
 * (a local Hardhat node is fine for development). Activated with
 * PRAMANA_LEDGER=evm; the deployment addresses come from contracts/deployments.json.
 *
 * viem is loaded dynamically so the default `local` path has no dependency on it
 * and the demo still boots if the chain tooling was never installed.
 */

type Deployments = Record<ContractName, `0x${string}`>;

const ABI = [
  {
    type: 'function',
    name: 'anchor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'kind', type: 'bytes32' },
      { name: 'subject', type: 'bytes32' },
      { name: 'payloadHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isAnchored',
    stateMutability: 'view',
    inputs: [{ name: 'payloadHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'anchoredAt',
    stateMutability: 'view',
    inputs: [{ name: 'payloadHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // The two specialised functions the rest of the system actually depends on
  // seeing populated: AuditAnchor.verifyInclusion reads `batches[root]`, and
  // the version registry reads `versionOf[documentHash]`. Neither is reachable
  // through the generic `anchor()` above - only through these.
  {
    type: 'function',
    name: 'anchorBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'root', type: 'bytes32' },
      { name: 'scope', type: 'bytes32' },
      { name: 'eventCount', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'anchorDocument',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'documentHash', type: 'bytes32' },
      { name: 'algorithm', type: 'bytes32' },
      { name: 'docTypeCode', type: 'bytes32' },
      { name: 'version', type: 'uint32' },
      { name: 'previousHash', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const;

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;

export class EvmLedger implements LedgerDriver {
  readonly name = 'evm' as const;
  readonly chainId = config.chainId;

  #client: any;
  #wallet: any;
  #deployments: Deployments | null = null;

  async #connect() {
    if (this.#client) return;
    const viem = await import('viem').catch(() => {
      throw new Error(
        'PRAMANA_LEDGER=evm requires viem. Run `npm install viem -w server`, start a node with ' +
          '`cd contracts && npx hardhat node`, deploy with `npx hardhat run scripts/deploy.ts --network localhost`.',
      );
    });
    const { privateKeyToAccount } = await import('viem/accounts');
    const chain = {
      id: Number(process.env.PRAMANA_EVM_CHAIN_ID ?? 31337),
      name: 'pramana-consortium',
      nativeCurrency: { name: 'None', symbol: 'NONE', decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    };
    const transport = viem.http(config.rpcUrl);
    this.#client = viem.createPublicClient({ chain, transport });
    // Hardhat's first funded account; a real deployment uses the node operator's key.
    const key = (process.env.PRAMANA_EVM_KEY ??
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`;
    this.#wallet = viem.createWalletClient({ account: privateKeyToAccount(key), chain, transport });

    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const path = resolve(config.storageDir, '..', '..', 'contracts', 'deployments.json');
    this.#deployments = JSON.parse(readFileSync(path, 'utf8')) as Deployments;
  }

  #address(contract: ContractName): `0x${string}` {
    const address = this.#deployments?.[contract];
    if (!address) throw new Error(`contract ${contract} is not deployed; run contracts/scripts/deploy.ts`);
    return address;
  }

  async submit(request: AnchorRequest) {
    await this.#connect();
    const payloadHash = hashObject(request.payload);
    // A hash-shaped value (a hex digest already computed off-chain) is packed
    // by parsing it as hex; a code-shaped value (a short semantic string like
    // a doc-type or scope code) is packed as raw UTF-8 bytes - the same scheme
    // this driver already used for `kind`/`subjectId` below.
    const toBytes32Hex = (hex: string) => `0x${hex.padStart(64, '0').slice(-64)}` as `0x${string}`;
    const toBytes32Utf8 = (text: string) =>
      `0x${Buffer.from(text).toString('hex').slice(0, 64).padEnd(64, '0')}` as `0x${string}`;
    const kindBytes = toBytes32Utf8(request.kind);
    const subjectBytes = toBytes32Utf8(request.subjectId);

    // Every anchor writes to the generic AnchorBase ledger by default. The two
    // methods below additionally populate the specialised contract state that
    // AuditAnchor.verifyInclusion and DocumentRegistry.versionOf actually read -
    // without this, submit() always called the generic function regardless of
    // request.method, so that specialised state was never written on chain.
    let functionName = 'anchor';
    let args: readonly unknown[] = [kindBytes, subjectBytes, toBytes32Hex(payloadHash)];

    if (request.contract === 'AuditAnchor' && request.method === 'anchorBatch') {
      functionName = 'anchorBatch';
      args = [
        toBytes32Hex(String(request.payload.merkleRoot)),
        toBytes32Utf8(String(request.payload.scope ?? 'national')),
        Number(request.payload.eventCount ?? 0),
      ];
    } else if (request.contract === 'DocumentRegistry' && request.method === 'anchorDocument') {
      functionName = 'anchorDocument';
      args = [
        toBytes32Hex(String(request.payload.documentHash)),
        toBytes32Utf8(String(request.payload.algorithm ?? '')),
        toBytes32Utf8(String(request.payload.docTypeCode ?? '')),
        Number(request.payload.version ?? 1),
        // Version-chain linking by prior document hash isn't tracked off-chain
        // at this call site today, so every version anchors as its own root
        // rather than reverting on a chain the app cannot supply.
        ZERO_BYTES32,
      ];
    }

    const txRef: string = await this.#wallet.writeContract({
      address: this.#address(request.contract),
      abi: ABI,
      functionName,
      args,
    });
    const receipt = await this.#client.waitForTransactionReceipt({ hash: txRef });

    return {
      driver: this.name,
      chainId: this.chainId,
      txRef,
      blockNumber: Number(receipt.blockNumber),
      blockHash: receipt.blockHash as string,
      contract: request.contract,
      payloadHash,
    };
  }

  async lookup(payloadHash: string) {
    await this.#connect();
    const found: boolean = await this.#client.readContract({
      address: this.#address('DocumentRegistry'),
      abi: ABI,
      functionName: 'isAnchored',
      args: [`0x${payloadHash}` as `0x${string}`],
    });
    return { found };
  }

  async status() {
    await this.#connect();
    const height = await this.#client.getBlockNumber();
    return {
      driver: this.name,
      chainId: this.chainId,
      rpcUrl: config.rpcUrl,
      height: Number(height),
      contracts: this.#deployments,
      consensus: 'QBFT (permissioned EVM)',
    };
  }
}
