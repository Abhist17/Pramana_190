// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AnchorBase
 * @notice Shared anchoring primitive for the PRAMANA consortium contracts.
 *
 * The single rule this codebase exists to enforce: THE CHAIN STORES PROOF, NEVER
 * CONTENT. Nothing here accepts a string, a name, or a blob. Every argument is a
 * fixed-width hash or a code. There is no function that can be made to record a
 * case narrative, and that is deliberate - an on-chain leak cannot be deleted.
 *
 * Writers are an explicit allowlist. On a permissioned network the node operators
 * are known institutions, but node access and write authority are different
 * things: a compromised application server must not be able to forge anchors.
 */
abstract contract AnchorBase {
    struct Anchor {
        bytes32 kind;
        bytes32 subject;
        uint64 blockTime;
        address submitter;
    }

    /// @notice payloadHash => anchor record. First write wins; anchors are immutable.
    mapping(bytes32 => Anchor) private _anchors;
    mapping(address => bool) public isWriter;
    address public admin;
    uint256 public anchorCount;

    event Anchored(
        bytes32 indexed payloadHash,
        bytes32 indexed kind,
        bytes32 indexed subject,
        address submitter,
        uint64 blockTime
    );
    event WriterUpdated(address indexed writer, bool allowed);
    event AdminTransferred(address indexed from, address indexed to);

    error NotAdmin();
    error NotWriter();
    error AlreadyAnchored(bytes32 payloadHash);
    error ZeroHash();

    constructor() {
        admin = msg.sender;
        isWriter[msg.sender] = true;
        emit WriterUpdated(msg.sender, true);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyWriter() {
        if (!isWriter[msg.sender]) revert NotWriter();
        _;
    }

    function setWriter(address writer, bool allowed) external onlyAdmin {
        isWriter[writer] = allowed;
        emit WriterUpdated(writer, allowed);
    }

    function transferAdmin(address next) external onlyAdmin {
        emit AdminTransferred(admin, next);
        admin = next;
    }

    /**
     * @notice Record a proof. Reverts if this payload hash was already anchored -
     * re-anchoring would let a later writer overwrite the recorded time, which is
     * precisely the property the whole design depends on not being possible.
     */
    function anchor(bytes32 kind, bytes32 subject, bytes32 payloadHash) public onlyWriter {
        if (payloadHash == bytes32(0)) revert ZeroHash();
        if (_anchors[payloadHash].blockTime != 0) revert AlreadyAnchored(payloadHash);

        _anchors[payloadHash] = Anchor({
            kind: kind,
            subject: subject,
            blockTime: uint64(block.timestamp),
            submitter: msg.sender
        });
        unchecked { anchorCount++; }

        emit Anchored(payloadHash, kind, subject, msg.sender, uint64(block.timestamp));
    }

    /// @notice Backs the public verifier: does the chain hold this exact fingerprint?
    function isAnchored(bytes32 payloadHash) external view returns (bool) {
        return _anchors[payloadHash].blockTime != 0;
    }

    /// @notice Block timestamp at which the payload was anchored, or 0 if never.
    function anchoredAt(bytes32 payloadHash) external view returns (uint256) {
        return _anchors[payloadHash].blockTime;
    }

    function anchorOf(bytes32 payloadHash) external view returns (Anchor memory) {
        return _anchors[payloadHash];
    }
}
