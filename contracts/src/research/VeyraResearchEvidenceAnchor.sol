// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Publishes immutable hashes identifying Security Swarm research records.
/// @dev A recorded hash proves only that its publisher anchored these bytes32 values.
///      It does not prove a report's truth, quality, review, or audit status.
contract VeyraResearchEvidenceAnchor {
    error UnauthorizedPublisher();
    error ZeroReportHash();
    error ZeroRunIdHash();
    error DuplicateReportHash(bytes32 reportHash);
    error DuplicateRunIdHash(bytes32 runIdHash);

    struct Evidence {
        bytes32 reportHash;
        bytes32 runIdHash;
        address publisher;
        uint256 recordedAt;
        bool exists;
    }

    event ResearchEvidenceRecorded(
        bytes32 indexed reportHash,
        bytes32 indexed runIdHash,
        address indexed publisher,
        uint256 recordedAt
    );

    address public immutable owner;

    mapping(bytes32 reportHash => Evidence evidence) private _evidenceByReportHash;
    mapping(bytes32 runIdHash => bytes32 reportHash) private _reportHashByRunIdHash;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Record one report/run hash pair. Each report and run hash is single-use.
    function recordEvidence(bytes32 reportHash, bytes32 runIdHash) external {
        if (msg.sender != owner) revert UnauthorizedPublisher();
        if (reportHash == bytes32(0)) revert ZeroReportHash();
        if (runIdHash == bytes32(0)) revert ZeroRunIdHash();
        if (_evidenceByReportHash[reportHash].exists) revert DuplicateReportHash(reportHash);
        if (_reportHashByRunIdHash[runIdHash] != bytes32(0)) revert DuplicateRunIdHash(runIdHash);

        uint256 recordedAt = block.timestamp;
        _evidenceByReportHash[reportHash] = Evidence({
            reportHash: reportHash,
            runIdHash: runIdHash,
            publisher: msg.sender,
            recordedAt: recordedAt,
            exists: true
        });
        _reportHashByRunIdHash[runIdHash] = reportHash;

        emit ResearchEvidenceRecorded(reportHash, runIdHash, msg.sender, recordedAt);
    }

    /// @notice Read the immutable record associated with a report hash.
    function getEvidence(bytes32 reportHash) external view returns (Evidence memory) {
        return _evidenceByReportHash[reportHash];
    }

    /// @notice Check whether a run identifier hash has already been anchored.
    function isRunRecorded(bytes32 runIdHash) external view returns (bool) {
        return _reportHashByRunIdHash[runIdHash] != bytes32(0);
    }
}
