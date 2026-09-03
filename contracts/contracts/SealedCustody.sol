// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AnchorBase.sol";

/**
 * @title SealedCustody
 * @notice Threshold-unseal requests, custodian approvals and waiting-period enforcement.
 *
 * Level-4 material — court-ordered sealed cover, protected witness identities,
 * source information — has its data key split across custodians off chain. This
 * contract governs the process of putting it back together:
 *
 *   - an unseal needs m-of-n custodian approvals;
 *   - a waiting period must elapse between request and unseal, during which every
 *     custodian is notified, so an illegitimate request is visible BEFORE it
 *     succeeds rather than discovered afterwards;
 *   - the requester cannot approve their own request;
 *   - every attempt, successful or not, is on the ledger.
 *
 * The key shares themselves never appear here. This contract records that a
 * process happened, not the secret it protects.
 */
contract SealedCustody is AnchorBase {
    struct Request {
        bytes32 documentRef;
        bytes32 requester;        // pseudonymous
        uint8 threshold;
        uint8 approvals;
        uint64 requestedAt;
        uint64 availableAt;
        bool fulfilled;
        bool cancelled;
    }

    struct Seal {
        uint8 threshold;
        uint8 custodianCount;
        uint64 sealedAt;
    }

    mapping(bytes32 => Seal) public seals;                          // documentRef => seal
    mapping(bytes32 => Request) public requests;                    // requestId => request
    mapping(bytes32 => mapping(bytes32 => bool)) public approvedBy; // requestId => custodian => approved

    event DocumentSealed(bytes32 indexed documentRef, uint8 threshold, uint8 custodianCount);
    event UnsealRequested(bytes32 indexed requestId, bytes32 indexed documentRef, bytes32 requester, uint64 availableAt);
    event UnsealApproved(bytes32 indexed requestId, bytes32 indexed custodian, uint8 approvals, uint8 threshold);
    event Unsealed(bytes32 indexed requestId, bytes32 indexed documentRef, uint64 at);
    event UnsealRejected(bytes32 indexed requestId, bytes32 reasonCode);

    error NotSealed(bytes32 documentRef);
    error RequestExists(bytes32 requestId);
    error UnknownRequest(bytes32 requestId);
    error AlreadyApproved(bytes32 custodian);
    error RequesterCannotApprove();
    error ThresholdNotMet(uint8 approvals, uint8 threshold);
    error WaitingPeriodActive(uint64 availableAt);
    error RequestClosed();
    error ThresholdTooLow();

    function sealDocument(bytes32 documentRef, uint8 threshold, uint8 custodianCount) external onlyWriter {
        // A threshold of one is not threshold custody; it is a single point of failure.
        if (threshold < 2 || custodianCount < threshold) revert ThresholdTooLow();
        seals[documentRef] = Seal({ threshold: threshold, custodianCount: custodianCount, sealedAt: uint64(block.timestamp) });
        anchor(keccak256("seal"), documentRef, keccak256(abi.encodePacked(documentRef, threshold, custodianCount)));
        emit DocumentSealed(documentRef, threshold, custodianCount);
    }

    function requestUnseal(
        bytes32 requestId,
        bytes32 documentRef,
        bytes32 requester,
        uint64 waitingSeconds
    ) external onlyWriter {
        if (seals[documentRef].sealedAt == 0) revert NotSealed(documentRef);
        if (requests[requestId].requestedAt != 0) revert RequestExists(requestId);

        uint64 availableAt = uint64(block.timestamp) + waitingSeconds;
        requests[requestId] = Request({
            documentRef: documentRef,
            requester: requester,
            threshold: seals[documentRef].threshold,
            approvals: 0,
            requestedAt: uint64(block.timestamp),
            availableAt: availableAt,
            fulfilled: false,
            cancelled: false
        });

        anchor(keccak256("seal"), requestId, requestId);
        emit UnsealRequested(requestId, documentRef, requester, availableAt);
    }

    function approveUnseal(bytes32 requestId, bytes32 custodian) external onlyWriter {
        Request storage request = requests[requestId];
        if (request.requestedAt == 0) revert UnknownRequest(requestId);
        if (request.fulfilled || request.cancelled) revert RequestClosed();
        if (custodian == request.requester) revert RequesterCannotApprove();
        if (approvedBy[requestId][custodian]) revert AlreadyApproved(custodian);

        approvedBy[requestId][custodian] = true;
        unchecked { request.approvals++; }
        emit UnsealApproved(requestId, custodian, request.approvals, request.threshold);
    }

    function recordUnseal(bytes32 requestId) external onlyWriter {
        Request storage request = requests[requestId];
        if (request.requestedAt == 0) revert UnknownRequest(requestId);
        if (request.fulfilled || request.cancelled) revert RequestClosed();
        if (request.approvals < request.threshold) revert ThresholdNotMet(request.approvals, request.threshold);
        // Enforced on chain, not merely in the application: the waiting period is
        // the window in which custodians can object, so it cannot be skipped by a
        // compromised server.
        if (block.timestamp < request.availableAt) revert WaitingPeriodActive(request.availableAt);

        request.fulfilled = true;
        anchor(keccak256("seal"), requestId, keccak256(abi.encodePacked(requestId, "unsealed")));
        emit Unsealed(requestId, request.documentRef, uint64(block.timestamp));
    }

    function rejectUnseal(bytes32 requestId, bytes32 reasonCode) external onlyWriter {
        Request storage request = requests[requestId];
        if (request.requestedAt == 0) revert UnknownRequest(requestId);
        if (request.fulfilled || request.cancelled) revert RequestClosed();
        request.cancelled = true;
        emit UnsealRejected(requestId, reasonCode);
    }
}
