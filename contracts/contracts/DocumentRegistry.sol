// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AnchorBase.sol";

/**
 * @title DocumentRegistry
 * @notice Anchors document fingerprints and maintains version chains.
 *
 * `documentHash` is the SHA-256 digest of the plaintext computed at capture,
 * before the document traversed any network. Nothing about the document's
 * content, its case, or the people in it is recorded here — only the fingerprint,
 * the algorithm identifier, a type code and a version pointer.
 *
 * The algorithm identifier travels with the hash so migration to a stronger
 * function is a planned re-anchoring rather than a crisis: old anchors stay valid
 * under the algorithm they were made with.
 */
contract DocumentRegistry is AnchorBase {
    struct Version {
        bytes32 documentHash;
        bytes32 algorithm;      // e.g. keccak("SHA-256")
        bytes32 docTypeCode;
        uint32 version;
        bytes32 previousHash;   // 0 for the first version
        uint64 sealedAt;
    }

    mapping(bytes32 => Version) public versionOf;      // documentHash => record
    mapping(bytes32 => bytes32) public successorOf;    // documentHash => next version's hash

    event DocumentAnchored(
        bytes32 indexed documentHash,
        bytes32 indexed docTypeCode,
        uint32 version,
        bytes32 previousHash
    );

    error PreviousVersionUnknown(bytes32 previousHash);
    error VersionAlreadySucceeded(bytes32 previousHash);

    function anchorDocument(
        bytes32 documentHash,
        bytes32 algorithm,
        bytes32 docTypeCode,
        uint32 version,
        bytes32 previousHash
    ) external onlyWriter {
        // A version chain must actually chain: you cannot claim v3 follows a v2
        // the ledger has never seen, and a version can be superseded only once.
        if (previousHash != bytes32(0)) {
            if (versionOf[previousHash].sealedAt == 0) revert PreviousVersionUnknown(previousHash);
            if (successorOf[previousHash] != bytes32(0)) revert VersionAlreadySucceeded(previousHash);
            successorOf[previousHash] = documentHash;
        }

        anchor(keccak256("document"), documentHash, documentHash);

        versionOf[documentHash] = Version({
            documentHash: documentHash,
            algorithm: algorithm,
            docTypeCode: docTypeCode,
            version: version,
            previousHash: previousHash,
            sealedAt: uint64(block.timestamp)
        });

        emit DocumentAnchored(documentHash, docTypeCode, version, previousHash);
    }
}
