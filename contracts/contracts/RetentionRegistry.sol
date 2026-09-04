// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AnchorBase.sol";

/**
 * @title RetentionRegistry
 * @notice Legal holds, disposal authorisations and certificates of destruction.
 *
 * The point of recording destruction on chain is the inverse of what people
 * expect from a ledger: it makes LAWFUL DELETION provable. The document's own
 * anchor survives in DocumentRegistry, and a destruction certificate sits beside
 * it here - so years later it stays demonstrable that the record existed and was
 * destroyed on schedule under authority, rather than having quietly gone missing.
 *
 * A legal hold blocks disposal on chain as well as in the application, so a
 * compromised application server cannot authorise the destruction of material a
 * court has frozen.
 */
contract RetentionRegistry is AnchorBase {
    struct Disposal {
        bytes32 originalHash;
        bytes32 certificateHash;
        bytes32 retentionClass;
        bytes32 methodCode;      // e.g. keccak("cryptographic_erasure")
        uint64 disposedAt;
    }

    mapping(bytes32 => bool) public legalHold;          // scopeRef (case or document) => held
    mapping(bytes32 => Disposal) public disposals;      // originalHash => disposal
    uint256 public disposalCount;

    event LegalHoldApplied(bytes32 indexed scopeRef, bytes32 orderRef, uint64 at);
    event LegalHoldLifted(bytes32 indexed scopeRef, bytes32 orderRef, uint64 at);
    event DisposalRecorded(
        bytes32 indexed originalHash,
        bytes32 indexed certificateHash,
        bytes32 retentionClass,
        bytes32 methodCode,
        uint64 at
    );

    error UnderLegalHold(bytes32 scopeRef);
    error AlreadyDisposed(bytes32 originalHash);

    function applyLegalHold(bytes32 scopeRef, bytes32 orderRef) external onlyWriter {
        legalHold[scopeRef] = true;
        anchor(keccak256("retention"), scopeRef, keccak256(abi.encodePacked(scopeRef, orderRef, "hold")));
        emit LegalHoldApplied(scopeRef, orderRef, uint64(block.timestamp));
    }

    function liftLegalHold(bytes32 scopeRef, bytes32 orderRef) external onlyWriter {
        legalHold[scopeRef] = false;
        anchor(keccak256("retention"), scopeRef, keccak256(abi.encodePacked(scopeRef, orderRef, "lift")));
        emit LegalHoldLifted(scopeRef, orderRef, uint64(block.timestamp));
    }

    function recordDisposal(
        bytes32 originalHash,
        bytes32 scopeRef,
        bytes32 certificateHash,
        bytes32 retentionClass,
        bytes32 methodCode
    ) external onlyWriter {
        if (legalHold[scopeRef]) revert UnderLegalHold(scopeRef);
        if (disposals[originalHash].disposedAt != 0) revert AlreadyDisposed(originalHash);

        disposals[originalHash] = Disposal({
            originalHash: originalHash,
            certificateHash: certificateHash,
            retentionClass: retentionClass,
            methodCode: methodCode,
            disposedAt: uint64(block.timestamp)
        });
        unchecked { disposalCount++; }

        anchor(keccak256("retention"), originalHash, certificateHash);
        emit DisposalRecorded(originalHash, certificateHash, retentionClass, methodCode, uint64(block.timestamp));
    }
}
