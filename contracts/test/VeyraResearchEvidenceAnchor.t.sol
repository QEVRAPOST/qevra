// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraResearchEvidenceAnchor} from "../src/research/VeyraResearchEvidenceAnchor.sol";

interface VmEvidenceAnchor {
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender) external;
}

contract VeyraResearchEvidenceAnchorTest {
    VmEvidenceAnchor private constant vm = VmEvidenceAnchor(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 private constant REPORT_HASH = bytes32(uint256(0xA11CE));
    bytes32 private constant SECOND_REPORT_HASH = bytes32(uint256(0xB0B));
    bytes32 private constant RUN_HASH = bytes32(uint256(0xC0FFEE));
    bytes32 private constant SECOND_RUN_HASH = bytes32(uint256(0xD00D));
    bytes32 private constant UNKNOWN_HASH = bytes32(uint256(0xBAD));
    address private constant NON_OWNER = address(0xBEEF);

    event ResearchEvidenceRecorded(
        bytes32 indexed reportHash,
        bytes32 indexed runIdHash,
        address indexed publisher,
        uint256 recordedAt
    );

    function test_constructorSetsImmutableOwnerToDeployer() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();

        require(anchor.owner() == address(this), "constructor must assign deployer as owner");
    }

    function test_recordEvidenceStoresAndEmits() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();
        uint256 expectedRecordedAt = block.timestamp;

        vm.expectEmit(true, true, true, true, address(anchor));
        emit ResearchEvidenceRecorded(REPORT_HASH, RUN_HASH, address(this), expectedRecordedAt);
        anchor.recordEvidence(REPORT_HASH, RUN_HASH);

        VeyraResearchEvidenceAnchor.Evidence memory evidence = anchor.getEvidence(REPORT_HASH);
        require(evidence.exists, "published record must exist");
        require(evidence.reportHash == REPORT_HASH, "report hash must be retained");
        require(evidence.runIdHash == RUN_HASH, "run hash must be retained");
        require(evidence.publisher == address(this), "publisher must be retained");
        require(evidence.recordedAt == expectedRecordedAt, "publication time must be retained");
        require(anchor.isRunRecorded(RUN_HASH), "run hash must be queryable");
    }

    function test_rejectsZeroReportHash() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchEvidenceAnchor.ZeroReportHash.selector));
        anchor.recordEvidence(bytes32(0), RUN_HASH);
    }

    function test_rejectsZeroRunIdHash() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchEvidenceAnchor.ZeroRunIdHash.selector));
        anchor.recordEvidence(REPORT_HASH, bytes32(0));
    }

    function test_onlyOwnerCanRecord() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchEvidenceAnchor.UnauthorizedPublisher.selector));
        vm.prank(NON_OWNER);
        anchor.recordEvidence(REPORT_HASH, RUN_HASH);
    }

    function test_rejectsDuplicateReportHash() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();
        anchor.recordEvidence(REPORT_HASH, RUN_HASH);

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchEvidenceAnchor.DuplicateReportHash.selector, REPORT_HASH));
        anchor.recordEvidence(REPORT_HASH, SECOND_RUN_HASH);
    }

    function test_rejectsDuplicateRunIdHash() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();
        anchor.recordEvidence(REPORT_HASH, RUN_HASH);

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchEvidenceAnchor.DuplicateRunIdHash.selector, RUN_HASH));
        anchor.recordEvidence(SECOND_REPORT_HASH, RUN_HASH);
    }

    function test_unknownReportAndRunLookupsAreAbsent() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();

        VeyraResearchEvidenceAnchor.Evidence memory evidence = anchor.getEvidence(UNKNOWN_HASH);
        require(!evidence.exists, "unknown report must be absent");
        require(evidence.reportHash == bytes32(0), "unknown report hash must be empty");
        require(evidence.runIdHash == bytes32(0), "unknown run hash must be empty");
        require(evidence.publisher == address(0), "unknown publisher must be empty");
        require(evidence.recordedAt == 0, "unknown timestamp must be empty");
        require(!anchor.isRunRecorded(UNKNOWN_HASH), "unknown run must be absent");
    }

    function test_rejectsDirectEtherTransfer() public {
        VeyraResearchEvidenceAnchor anchor = new VeyraResearchEvidenceAnchor();
        vm.deal(address(this), 1 ether);

        (bool success,) = address(anchor).call{value: 1 wei}("");

        require(!success, "anchor must reject direct Ether transfers");
        require(address(anchor).balance == 0, "rejected transfer must not credit the anchor");
    }
}
