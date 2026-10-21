// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraAccessManaged} from "../access/VeyraAccessManaged.sol";

/// @notice Records digest-only attestations by explicitly authorized research publishers.
/// @dev An attestation records who published hashes; it does not validate a report or assert truth.
contract VeyraResearchAttestationRegistry is VeyraAccessManaged {
    bytes32 public constant ATTESTOR_ROLE = keccak256("VEYRA_RESEARCH_ATTESTOR_ROLE");

    struct Attestation {
        bytes32 reportDigest;
        bytes32 manifestDigest;
        bytes32 runId;
        address attestor;
        uint256 attestedAt;
        bool exists;
    }

    mapping(bytes32 attestationId => Attestation value) private _attestations;
    mapping(bytes32 runId => bytes32 attestationId) public attestationForRun;

    error UnauthorizedAttestor(address caller);
    error ZeroDigest();
    error DuplicateRun(bytes32 runId);

    event AttestationRecorded(
        bytes32 indexed attestationId,
        bytes32 indexed reportDigest,
        bytes32 indexed runId,
        bytes32 manifestDigest,
        address attestor,
        uint256 attestedAt
    );

    constructor(address initialAttestor) {
        if (initialAttestor == address(0)) revert ZeroAddress();
        _grantRole(ATTESTOR_ROLE, initialAttestor);
    }

    function attest(bytes32 reportDigest, bytes32 manifestDigest, bytes32 runId) external returns (bytes32 id) {
        if (!hasRole(ATTESTOR_ROLE, msg.sender)) revert UnauthorizedAttestor(msg.sender);
        if (reportDigest == bytes32(0) || manifestDigest == bytes32(0) || runId == bytes32(0)) revert ZeroDigest();
        if (attestationForRun[runId] != bytes32(0)) revert DuplicateRun(runId);

        id = keccak256(abi.encode(block.chainid, address(this), msg.sender, reportDigest, manifestDigest, runId));
        uint256 now_ = block.timestamp;
        _attestations[id] = Attestation({
            reportDigest: reportDigest,
            manifestDigest: manifestDigest,
            runId: runId,
            attestor: msg.sender,
            attestedAt: now_,
            exists: true
        });
        attestationForRun[runId] = id;
        emit AttestationRecorded(id, reportDigest, runId, manifestDigest, msg.sender, now_);
    }

    function getAttestation(bytes32 id) external view returns (Attestation memory) {
        return _attestations[id];
    }
}
