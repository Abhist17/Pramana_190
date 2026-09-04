// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AnchorBase.sol";

/**
 * @title AuditAnchor
 * @notice Accepts periodic Merkle roots of audit batches.
 *
 * This contract is the reason the audit design scales. Sixteen thousand police
 * stations generating millions of reads, prints and downloads a day cannot each
 * become a transaction. Instead every event in a time window is a leaf, only the
 * root is anchored here, and each event keeps a short inclusion proof - so any
 * single log line can be proved authentic and un-backdated while the chain
 * carries a handful of transactions per station per window.
 *
 * Verification of an inclusion proof is a pure function and is provided on chain
 * so that a court-appointed expert can check a log line without trusting any
 * server, including ours.
 */
contract AuditAnchor is AnchorBase {
    struct Batch {
        bytes32 root;
        bytes32 scope;        // station code, or keccak("national")
        uint32 eventCount;
        uint64 sealedAt;
    }

    mapping(bytes32 => Batch) public batches;    // root => batch
    uint256 public batchCount;

    event BatchAnchored(bytes32 indexed root, bytes32 indexed scope, uint32 eventCount, uint64 sealedAt);

    error RootAlreadyAnchored(bytes32 root);
    error EmptyBatch();

    function anchorBatch(bytes32 root, bytes32 scope, uint32 eventCount) external onlyWriter {
        if (eventCount == 0) revert EmptyBatch();
        if (batches[root].sealedAt != 0) revert RootAlreadyAnchored(root);

        batches[root] = Batch({ root: root, scope: scope, eventCount: eventCount, sealedAt: uint64(block.timestamp) });
        unchecked { batchCount++; }

        anchor(keccak256("audit_batch"), root, root);
        emit BatchAnchored(root, scope, eventCount, uint64(block.timestamp));
    }

    /**
     * @notice Verify that `leaf` belongs to an anchored batch.
     * @param path Sibling hashes from the leaf upward.
     * @param isLeft For each step, true when the sibling sits on the LEFT.
     *
     * Domain separation matches the off-chain implementation in
     * server/src/core/merkle.ts: 0x00 prefixes a leaf, 0x01 an internal node.
     * Without it an internal node could be replayed as a leaf.
     */
    function verifyInclusion(
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata path,
        bool[] calldata isLeft
    ) external view returns (bool included, uint64 anchoredTime) {
        require(path.length == isLeft.length, "path/side length mismatch");

        bytes32 computed = leaf;
        for (uint256 i; i < path.length; i++) {
            computed = isLeft[i]
                ? sha256(abi.encodePacked(bytes1(0x01), path[i], computed))
                : sha256(abi.encodePacked(bytes1(0x01), computed, path[i]));
        }
        included = computed == root && batches[root].sealedAt != 0;
        anchoredTime = batches[root].sealedAt;
    }
}
