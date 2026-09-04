// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AnchorBase.sol";

/**
 * @title CustodyLedger
 * @notice Signed custody transfers for documents and physical exhibits.
 *
 * Each event references the previous one, so a gap is structurally visible: the
 * next event's `previousEvent` would point at a record that does not exist.
 *
 * Actors are PSEUDONYMOUS here. If real officer identifiers went on chain the
 * ledger would itself become a permanent, un-deletable surveillance record of
 * which officer touched which case - the mapping stays off-chain under access
 * control.
 *
 * The same ledger carries physical exhibits (a seized weapon, a sealed sample, a
 * phone). That is how PRAMANA answers the "manage police assets throughout their
 * lifecycle" requirement: a charge sheet and a seized weapon are both custodial
 * assets with an owner, a location, a condition and a disposal date.
 */
contract CustodyLedger is AnchorBase {
    enum SubjectType { Document, Exhibit }

    struct Transfer {
        bytes32 itemHash;
        bytes32 fromActor;      // pseudonymous
        bytes32 toActor;        // pseudonymous
        bytes32 actionCode;
        bytes32 previousEvent;
        SubjectType subjectType;
        uint64 recordedAt;
    }

    mapping(bytes32 => Transfer) public transfers;     // eventId => transfer
    mapping(bytes32 => bytes32) public latestEvent;    // itemHash => most recent eventId
    uint256 public transferCount;

    event CustodyRecorded(
        bytes32 indexed eventId,
        bytes32 indexed itemHash,
        bytes32 indexed actionCode,
        bytes32 fromActor,
        bytes32 toActor,
        bytes32 previousEvent
    );

    error EventExists(bytes32 eventId);
    error ChainBroken(bytes32 expectedPrevious, bytes32 suppliedPrevious);

    function recordTransfer(
        bytes32 eventId,
        bytes32 itemHash,
        bytes32 fromActor,
        bytes32 toActor,
        bytes32 actionCode,
        bytes32 previousEvent,
        SubjectType subjectType
    ) external onlyWriter {
        if (transfers[eventId].recordedAt != 0) revert EventExists(eventId);

        // The supplied predecessor must be the ledger's current head for this item.
        // This is what makes a missing link impossible rather than merely detectable.
        bytes32 head = latestEvent[itemHash];
        if (head != previousEvent) revert ChainBroken(head, previousEvent);

        transfers[eventId] = Transfer({
            itemHash: itemHash,
            fromActor: fromActor,
            toActor: toActor,
            actionCode: actionCode,
            previousEvent: previousEvent,
            subjectType: subjectType,
            recordedAt: uint64(block.timestamp)
        });
        latestEvent[itemHash] = eventId;
        unchecked { transferCount++; }

        anchor(keccak256("custody"), eventId, eventId);
        emit CustodyRecorded(eventId, itemHash, actionCode, fromActor, toActor, previousEvent);
    }

    /// @notice Walks the chain backwards; used to produce a custody history off-chain.
    function historyOf(bytes32 itemHash, uint256 maxDepth) external view returns (bytes32[] memory ids) {
        bytes32 cursor = latestEvent[itemHash];
        uint256 count;
        bytes32 probe = cursor;
        while (probe != bytes32(0) && count < maxDepth) {
            count++;
            probe = transfers[probe].previousEvent;
        }
        ids = new bytes32[](count);
        for (uint256 i; i < count; i++) {
            ids[i] = cursor;
            cursor = transfers[cursor].previousEvent;
        }
    }
}
