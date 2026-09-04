import { expect } from 'chai';
import { ethers } from 'hardhat';

const kind = (label: string) => ethers.keccak256(ethers.toUtf8Bytes(label));
const h = (label: string) => ethers.sha256(ethers.toUtf8Bytes(label));
const ZERO = ethers.ZeroHash;

/** Mirrors server/src/core/merkle.ts - same domain separation, same promotion rule. */
function hashLeaf(payload: string): string {
  return ethers.sha256(ethers.concat(['0x00', ethers.toUtf8Bytes(payload)]));
}
function hashPair(left: string, right: string): string {
  return ethers.sha256(ethers.concat(['0x01', left, right]));
}
function buildTree(leaves: string[]): string[][] {
  const levels = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(current[i + 1] === undefined ? current[i]! : hashPair(current[i]!, current[i + 1]!));
    }
    levels.push(next);
    current = next;
  }
  return levels;
}
function proofFor(leaves: string[], index: number) {
  const levels = buildTree(leaves);
  const path: string[] = [];
  const isLeft: boolean[] = [];
  let cursor = index;
  for (let level = 0; level < levels.length - 1; level++) {
    const nodes = levels[level]!;
    const right = cursor % 2 === 1;
    const sibling = nodes[right ? cursor - 1 : cursor + 1];
    if (sibling !== undefined) { path.push(sibling); isLeft.push(right); }
    cursor = Math.floor(cursor / 2);
  }
  return { path, isLeft, root: levels[levels.length - 1]![0]! };
}

describe('AnchorBase', () => {
  it('anchors once and refuses to overwrite', async () => {
    const registry = await (await ethers.getContractFactory('DocumentRegistry')).deploy();
    await registry.anchor(kind('document'), h('subject'), h('payload'));
    expect(await registry.isAnchored(h('payload'))).to.equal(true);
    // Re-anchoring would let a later writer move the recorded time - the exact
    // property the whole design depends on being impossible.
    await expect(registry.anchor(kind('document'), h('subject'), h('payload')))
      .to.be.revertedWithCustomError(registry, 'AlreadyAnchored');
  });

  it('refuses writes from a non-writer', async () => {
    const [, outsider] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory('DocumentRegistry')).deploy();
    await expect(registry.connect(outsider).anchor(kind('document'), h('s'), h('p')))
      .to.be.revertedWithCustomError(registry, 'NotWriter');
  });

  it('rejects the zero hash', async () => {
    const registry = await (await ethers.getContractFactory('DocumentRegistry')).deploy();
    await expect(registry.anchor(kind('document'), h('s'), ZERO))
      .to.be.revertedWithCustomError(registry, 'ZeroHash');
  });

  it('lets the admin add and remove writers', async () => {
    const [, other] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory('DocumentRegistry')).deploy();
    await registry.setWriter(other.address, true);
    await registry.connect(other).anchor(kind('document'), h('s'), h('p2'));
    await registry.setWriter(other.address, false);
    await expect(registry.connect(other).anchor(kind('document'), h('s'), h('p3')))
      .to.be.revertedWithCustomError(registry, 'NotWriter');
  });
});

describe('DocumentRegistry', () => {
  it('chains versions and rejects an unknown predecessor', async () => {
    const registry = await (await ethers.getContractFactory('DocumentRegistry')).deploy();
    const v1 = h('chargesheet-v1');
    const v2 = h('chargesheet-v2');

    await registry.anchorDocument(v1, kind('SHA-256'), kind('chargesheet'), 1, ZERO);
    await registry.anchorDocument(v2, kind('SHA-256'), kind('chargesheet'), 2, v1);

    expect((await registry.versionOf(v2)).previousHash).to.equal(v1);
    expect(await registry.successorOf(v1)).to.equal(v2);

    await expect(registry.anchorDocument(h('v9'), kind('SHA-256'), kind('chargesheet'), 9, h('never-seen')))
      .to.be.revertedWithCustomError(registry, 'PreviousVersionUnknown');
  });

  it('refuses to fork a version chain', async () => {
    const registry = await (await ethers.getContractFactory('DocumentRegistry')).deploy();
    const v1 = h('statement-v1');
    await registry.anchorDocument(v1, kind('SHA-256'), kind('statement'), 1, ZERO);
    await registry.anchorDocument(h('statement-v2'), kind('SHA-256'), kind('statement'), 2, v1);
    // Two different "version 2"s would make the record ambiguous in court.
    await expect(registry.anchorDocument(h('statement-v2-alt'), kind('SHA-256'), kind('statement'), 2, v1))
      .to.be.revertedWithCustomError(registry, 'VersionAlreadySucceeded');
  });
});

describe('CustodyLedger', () => {
  it('records a chain and rejects a broken link', async () => {
    const ledger = await (await ethers.getContractFactory('CustodyLedger')).deploy();
    const item = h('exhibit-1');
    const e1 = h('event-1');
    const e2 = h('event-2');

    await ledger.recordTransfer(e1, item, kind(''), kind('ACTOR-IO'), kind('seal'), ZERO, 0);
    await ledger.recordTransfer(e2, item, kind('ACTOR-IO'), kind('ACTOR-FSL'), kind('transfer'), e1, 1);

    expect(await ledger.latestEvent(item)).to.equal(e2);
    // Supplying a stale predecessor is how a gap would be hidden; it cannot be.
    await expect(ledger.recordTransfer(h('event-3'), item, kind('ACTOR-FSL'), kind('ACTOR-COURT'), kind('produce'), e1, 1))
      .to.be.revertedWithCustomError(ledger, 'ChainBroken');
  });

  it('returns history newest-first', async () => {
    const ledger = await (await ethers.getContractFactory('CustodyLedger')).deploy();
    const item = h('doc-x');
    await ledger.recordTransfer(h('a'), item, kind(''), kind('IO'), kind('seal'), ZERO, 0);
    await ledger.recordTransfer(h('b'), item, kind('IO'), kind('SHO'), kind('transfer'), h('a'), 0);
    const history = await ledger.historyOf(item, 10);
    expect(history.map(String)).to.deep.equal([h('b'), h('a')]);
  });
});

describe('AuditAnchor', () => {
  it('verifies a Merkle inclusion proof built off chain', async () => {
    const audit = await (await ethers.getContractFactory('AuditAnchor')).deploy();
    const leaves = Array.from({ length: 23 }, (_, i) => hashLeaf(`event-${i}`));
    const { root } = proofFor(leaves, 0);

    await audit.anchorBatch(root, kind('KALMESHWAR-PS'), leaves.length);

    // Every leaf must verify - this is the promise made to a court about any one line.
    for (let index = 0; index < leaves.length; index++) {
      const { path, isLeft } = proofFor(leaves, index);
      const [included] = await audit.verifyInclusion(root, leaves[index]!, path, isLeft);
      expect(included, `leaf ${index}`).to.equal(true);
    }

    const forged = proofFor(leaves, 5);
    const [includedForged] = await audit.verifyInclusion(root, hashLeaf('event-forged'), forged.path, forged.isLeft);
    expect(includedForged).to.equal(false);
  });

  it('rejects an empty batch and a duplicate root', async () => {
    const audit = await (await ethers.getContractFactory('AuditAnchor')).deploy();
    await expect(audit.anchorBatch(h('r'), kind('scope'), 0)).to.be.revertedWithCustomError(audit, 'EmptyBatch');
    await audit.anchorBatch(h('r'), kind('scope'), 3);
    await expect(audit.anchorBatch(h('r'), kind('scope'), 3))
      .to.be.revertedWithCustomError(audit, 'RootAlreadyAnchored');
  });
});

describe('AccessPolicyRegistry', () => {
  it('records effective periods and answers which policy governed a past access', async () => {
    const registry = await (await ethers.getContractFactory('AccessPolicyRegistry')).deploy();
    await registry.registerPolicy(h('policy-v1'), 1, 17);
    const first = await registry.policies(0);
    const midpoint = first.effectiveFrom + 1n;

    await ethers.provider.send('evm_increaseTime', [120]);
    await registry.registerPolicy(h('policy-v2'), 2, 19);

    expect(await registry.currentPolicyHash()).to.equal(h('policy-v2'));
    // The whole point: an access from last year is judged against last year's rules.
    expect((await registry.policyAt(midpoint)).policyHash).to.equal(h('policy-v1'));
    expect((await registry.policies(0)).effectiveTo).to.be.greaterThan(0n);
  });

  it('refuses a non-increasing version', async () => {
    const registry = await (await ethers.getContractFactory('AccessPolicyRegistry')).deploy();
    await registry.registerPolicy(h('p1'), 2, 5);
    await expect(registry.registerPolicy(h('p2'), 1, 5))
      .to.be.revertedWithCustomError(registry, 'VersionNotIncreasing');
  });
});

describe('SealedCustody', () => {
  const doc = h('sealed-doc');

  async function sealed() {
    const custody = await (await ethers.getContractFactory('SealedCustody')).deploy();
    await custody.sealDocument(doc, 2, 3);
    return custody;
  }

  it('refuses a threshold of one - that is not threshold custody', async () => {
    const custody = await (await ethers.getContractFactory('SealedCustody')).deploy();
    await expect(custody.sealDocument(doc, 1, 3)).to.be.revertedWithCustomError(custody, 'ThresholdTooLow');
  });

  it('blocks an unseal until the threshold AND the waiting period are satisfied', async () => {
    const custody = await sealed();
    const request = h('request-1');
    await custody.requestUnseal(request, doc, kind('ACTOR-IO'), 3600);

    await expect(custody.recordUnseal(request)).to.be.revertedWithCustomError(custody, 'ThresholdNotMet');

    await custody.approveUnseal(request, kind('ACTOR-JUDGE'));
    await custody.approveUnseal(request, kind('ACTOR-DSP'));

    // Approvals are in place, but the objection window has not closed.
    await expect(custody.recordUnseal(request)).to.be.revertedWithCustomError(custody, 'WaitingPeriodActive');

    await ethers.provider.send('evm_increaseTime', [3601]);
    await ethers.provider.send('evm_mine', []);
    await expect(custody.recordUnseal(request)).to.emit(custody, 'Unsealed');
  });

  it('will not let the requester approve their own request', async () => {
    const custody = await sealed();
    const request = h('request-2');
    await custody.requestUnseal(request, doc, kind('ACTOR-IO'), 60);
    await expect(custody.approveUnseal(request, kind('ACTOR-IO')))
      .to.be.revertedWithCustomError(custody, 'RequesterCannotApprove');
  });

  it('counts each custodian once', async () => {
    const custody = await sealed();
    const request = h('request-3');
    await custody.requestUnseal(request, doc, kind('ACTOR-IO'), 60);
    await custody.approveUnseal(request, kind('ACTOR-JUDGE'));
    await expect(custody.approveUnseal(request, kind('ACTOR-JUDGE')))
      .to.be.revertedWithCustomError(custody, 'AlreadyApproved');
  });
});

describe('RetentionRegistry', () => {
  it('makes lawful destruction provable', async () => {
    const registry = await (await ethers.getContractFactory('RetentionRegistry')).deploy();
    const original = h('doc-to-dispose');
    await registry.recordDisposal(original, h('case-1'), h('cert-1'), kind('standard'), kind('cryptographic_erasure'));
    const disposal = await registry.disposals(original);
    expect(disposal.certificateHash).to.equal(h('cert-1'));
    expect(disposal.disposedAt).to.be.greaterThan(0n);
  });

  it('refuses disposal under a legal hold', async () => {
    const registry = await (await ethers.getContractFactory('RetentionRegistry')).deploy();
    await registry.applyLegalHold(h('case-2'), h('court-order-7'));
    await expect(
      registry.recordDisposal(h('doc-2'), h('case-2'), h('cert-2'), kind('standard'), kind('cryptographic_erasure')),
    ).to.be.revertedWithCustomError(registry, 'UnderLegalHold');

    await registry.liftLegalHold(h('case-2'), h('court-order-9'));
    await expect(registry.recordDisposal(h('doc-2'), h('case-2'), h('cert-2'), kind('standard'), kind('cryptographic_erasure')))
      .to.emit(registry, 'DisposalRecorded');
  });
});
