// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AnchorBase.sol";

/**
 * @title AccessPolicyRegistry
 * @notice Anchors the hash of each access-policy version with its effective period.
 *
 * This closes an argument the defence would otherwise open. Years after an
 * access, "what were the access rules on that day?" becomes answerable with a
 * hash rather than a witness: the policy set in force at any past moment is
 * fixed on chain and cannot be quietly rewritten to justify a past decision.
 */
contract AccessPolicyRegistry is AnchorBase {
    struct Policy {
        bytes32 policyHash;
        uint32 version;
        uint32 ruleCount;
        uint64 effectiveFrom;
        uint64 effectiveTo;   // 0 while current
    }

    Policy[] public policies;
    mapping(bytes32 => uint256) public indexOfHash;  // policyHash => policies index + 1
    bytes32 public currentPolicyHash;

    event PolicyRegistered(bytes32 indexed policyHash, uint32 version, uint32 ruleCount, uint64 effectiveFrom);
    event PolicyRetired(bytes32 indexed policyHash, uint64 effectiveTo);

    error PolicyExists(bytes32 policyHash);
    error VersionNotIncreasing(uint32 supplied, uint32 current);

    function registerPolicy(bytes32 policyHash, uint32 version, uint32 ruleCount) external onlyWriter {
        if (indexOfHash[policyHash] != 0) revert PolicyExists(policyHash);

        if (policies.length > 0) {
            Policy storage previous = policies[policies.length - 1];
            if (version <= previous.version) revert VersionNotIncreasing(version, previous.version);
            previous.effectiveTo = uint64(block.timestamp);
            emit PolicyRetired(previous.policyHash, uint64(block.timestamp));
        }

        policies.push(Policy({
            policyHash: policyHash,
            version: version,
            ruleCount: ruleCount,
            effectiveFrom: uint64(block.timestamp),
            effectiveTo: 0
        }));
        indexOfHash[policyHash] = policies.length;
        currentPolicyHash = policyHash;

        anchor(keccak256("policy"), policyHash, policyHash);
        emit PolicyRegistered(policyHash, version, ruleCount, uint64(block.timestamp));
    }

    /// @notice Which policy governed access at `timestamp`?
    function policyAt(uint64 timestamp) external view returns (Policy memory found) {
        for (uint256 i = policies.length; i > 0; i--) {
            Policy storage candidate = policies[i - 1];
            if (candidate.effectiveFrom <= timestamp &&
                (candidate.effectiveTo == 0 || candidate.effectiveTo > timestamp)) {
                return candidate;
            }
        }
    }

    function policyCount() external view returns (uint256) {
        return policies.length;
    }
}
