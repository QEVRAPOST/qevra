// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MainnetDeploymentApproval} from "../script/MainnetDeploymentApproval.sol";

interface VmMainnetApprovalTest {
    function addr(uint256 privateKey) external pure returns (address);
    function expectRevert(bytes calldata revertData) external;
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
}

contract MainnetDeploymentApprovalHarness {
    function reviewPersonalSignMessage(MainnetDeploymentApproval.Record memory record) external pure returns (bytes32) {
        return MainnetDeploymentApproval.reviewPersonalSignMessage(record);
    }

    function ownerPersonalSignMessage(MainnetDeploymentApproval.Record memory record) external pure returns (bytes32) {
        return MainnetDeploymentApproval.ownerPersonalSignMessage(record);
    }

    function reviewDigest(MainnetDeploymentApproval.Record memory record) external pure returns (bytes32) {
        return MainnetDeploymentApproval.reviewDigest(record);
    }

    function ownerDigest(MainnetDeploymentApproval.Record memory record) external pure returns (bytes32) {
        return MainnetDeploymentApproval.ownerDigest(record);
    }

    function ownerRiskAcceptanceDigest(MainnetDeploymentApproval.Record memory record) external pure returns (bytes32) {
        return MainnetDeploymentApproval.ownerRiskAcceptanceDigest(record);
    }

    function ownerRiskAcceptancePersonalSignMessage(MainnetDeploymentApproval.Record memory record)
        external
        pure
        returns (bytes32)
    {
        return MainnetDeploymentApproval.ownerRiskAcceptancePersonalSignMessage(record);
    }

    function verify(
        MainnetDeploymentApproval.Record memory record,
        bytes memory reviewSignature,
        bytes memory ownerSignature,
        uint256 now_
    ) external pure {
        MainnetDeploymentApproval.verify(record, reviewSignature, ownerSignature, now_);
    }

    function verifyOwnerRiskAcceptance(
        MainnetDeploymentApproval.Record memory record,
        bytes memory ownerSignature,
        uint256 now_
    ) external pure {
        MainnetDeploymentApproval.verifyOwnerRiskAcceptance(record, ownerSignature, now_);
    }

    function verifyLegacyGasPrice(uint256 observed, uint256 approved) external pure {
        MainnetDeploymentApproval.verifyLegacyGasPrice(observed, approved);
    }
}

contract MainnetDeploymentApprovalTest {
    VmMainnetApprovalTest private constant vm =
        VmMainnetApprovalTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant REVIEWER_KEY = 0xA11CE;
    uint256 private constant OWNER_KEY = 0xB0B;
    uint256 private constant NOW = 1_800_000_000;

    function test_acceptsDistinctReviewerAndOwnerSignaturesBoundToTheDeploymentRecord() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        (bytes memory reviewSignature, bytes memory ownerSignature) = _sign(harness, record);

        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_metaMaskPersonalSignMessagesProduceTheExistingApprovalDigests() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        bytes32 reviewerMessage = harness.reviewPersonalSignMessage(record);
        bytes32 ownerMessage = harness.ownerPersonalSignMessage(record);
        bytes32 reviewerDigest = _personalSignDigest(reviewerMessage);
        bytes32 ownerDigest = _personalSignDigest(ownerMessage);

        require(reviewerDigest == harness.reviewDigest(record), "review personal_sign digest changed");
        require(ownerDigest == harness.ownerDigest(record), "owner personal_sign digest changed");

        harness.verify(record, _signature(REVIEWER_KEY, reviewerDigest), _signature(OWNER_KEY, ownerDigest), NOW);
    }

    function test_rejectsReviewSignatureWhenDeploymentBatchChanges() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        (bytes memory reviewSignature, bytes memory ownerSignature) = _sign(harness, record);
        record.deploymentBatchHash = keccak256("different batch");

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidReviewerSignature.selector));
        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_rejectsOwnerSignatureWhenFeeCeilingChanges() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        (bytes memory reviewSignature, bytes memory ownerSignature) = _sign(harness, record);
        record.maxFeePerGasWei += 1;

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidOwnerSignature.selector));
        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_rejectsReviewerSignatureWhenIndependentReportHashChanges() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        (bytes memory reviewSignature, bytes memory ownerSignature) = _sign(harness, record);
        record.independentReviewReportSha256 = keccak256("different independent review report");

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidReviewerSignature.selector));
        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_acceptsOwnerRiskAcceptanceForExactDormantDeploymentWithoutReviewer() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        record.releasePolicy = 1;
        record.reviewer = address(0);
        record.reviewPackageSha256 = bytes32(0);
        record.independentReviewReportSha256 = bytes32(0);
        bytes memory ownerSignature = _signature(OWNER_KEY, harness.ownerRiskAcceptanceDigest(record));

        harness.verifyOwnerRiskAcceptance(record, ownerSignature, NOW);
    }

    function test_ownerRiskMessageProducesTheDigestUsedByMetaMaskPersonalSign() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        record.releasePolicy = 1;
        record.reviewer = address(0);
        record.reviewPackageSha256 = bytes32(0);
        record.independentReviewReportSha256 = bytes32(0);
        bytes32 message = harness.ownerRiskAcceptancePersonalSignMessage(record);
        bytes32 observedDigest = _personalSignDigest(message);

        require(observedDigest == harness.ownerRiskAcceptanceDigest(record), "owner risk personal_sign digest mismatch");
    }

    function test_ownerRiskAcceptanceRejectsChangedDeploymentBatch() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        record.releasePolicy = 1;
        record.reviewer = address(0);
        record.reviewPackageSha256 = bytes32(0);
        record.independentReviewReportSha256 = bytes32(0);
        bytes memory ownerSignature = _signature(OWNER_KEY, harness.ownerRiskAcceptanceDigest(record));
        record.deploymentBatchHash = keccak256("changed operations");

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidOwnerSignature.selector));
        harness.verifyOwnerRiskAcceptance(record, ownerSignature, NOW);
    }

    function test_ownerRiskAcceptanceRejectsChangedFeeCeiling() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        record.releasePolicy = 1;
        record.reviewer = address(0);
        record.reviewPackageSha256 = bytes32(0);
        record.independentReviewReportSha256 = bytes32(0);
        bytes memory ownerSignature = _signature(OWNER_KEY, harness.ownerRiskAcceptanceDigest(record));
        record.maxTotalFeeWei += 1;

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidOwnerSignature.selector));
        harness.verifyOwnerRiskAcceptance(record, ownerSignature, NOW);
    }

    function test_ownerRiskAcceptanceRejectsChangedOwnerOrStartingNonce() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        record.releasePolicy = 1;
        record.reviewer = address(0);
        record.reviewPackageSha256 = bytes32(0);
        record.independentReviewReportSha256 = bytes32(0);
        bytes memory ownerSignature = _signature(OWNER_KEY, harness.ownerRiskAcceptanceDigest(record));
        record.startingDeployerNonce += 1;

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidOwnerSignature.selector));
        harness.verifyOwnerRiskAcceptance(record, ownerSignature, NOW);
    }

    function test_reviewSignaturesCannotAuthorizeTheOwnerRiskPolicy() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        (bytes memory reviewSignature, bytes memory ownerSignature) = _sign(harness, record);
        record.releasePolicy = 1;

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidApprovalRecord.selector));
        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_ownerRiskAcceptanceCannotAuthorizeTheIndependentReviewPolicy() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        record.releasePolicy = 1;
        record.reviewer = address(0);
        record.reviewPackageSha256 = bytes32(0);
        record.independentReviewReportSha256 = bytes32(0);
        bytes memory ownerSignature = _signature(OWNER_KEY, harness.ownerRiskAcceptanceDigest(record));
        record.releasePolicy = 0;

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidApprovalRecord.selector));
        harness.verifyOwnerRiskAcceptance(record, ownerSignature, NOW);
    }

    function test_rejectsExpiredOrExcessivelyLongApproval() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        (bytes memory reviewSignature, bytes memory ownerSignature) = _sign(harness, record);

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidApprovalWindow.selector));
        harness.verify(record, reviewSignature, ownerSignature, record.expiresAt);

        record.expiresAt = NOW + MainnetDeploymentApproval.MAX_APPROVAL_TTL + 1;
        (reviewSignature, ownerSignature) = _sign(harness, record);
        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidApprovalWindow.selector));
        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_rejectsReviewerWhoOverlapsADeploymentRole() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        record.reviewer = record.owner;
        (bytes memory reviewSignature, bytes memory ownerSignature) = _sign(harness, record);

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidReviewer.selector));
        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_rejectsMalformedOrMalleableSignature() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        MainnetDeploymentApproval.Record memory record = _record();
        bytes memory reviewSignature = new bytes(64);
        bytes memory ownerSignature = _signature(OWNER_KEY, harness.ownerDigest(record));

        vm.expectRevert(abi.encodeWithSelector(MainnetDeploymentApproval.InvalidSignatureEncoding.selector));
        harness.verify(record, reviewSignature, ownerSignature, NOW);
    }

    function test_legacyGasPriceMustExactlyMatchTheOwnerApprovedCeiling() public {
        MainnetDeploymentApprovalHarness harness = new MainnetDeploymentApprovalHarness();
        uint256 approved = 41_540_001;
        harness.verifyLegacyGasPrice(approved, approved);

        vm.expectRevert(
            abi.encodeWithSelector(MainnetDeploymentApproval.BroadcastGasPriceMismatch.selector, 1, approved)
        );
        harness.verifyLegacyGasPrice(1, approved);

        vm.expectRevert(
            abi.encodeWithSelector(MainnetDeploymentApproval.BroadcastGasPriceMismatch.selector, approved + 1, approved)
        );
        harness.verifyLegacyGasPrice(approved + 1, approved);
    }

    function _record() private pure returns (MainnetDeploymentApproval.Record memory record) {
        record = MainnetDeploymentApproval.Record({
            chainId: 4_663,
            deployer: address(0xD3),
            owner: vm.addr(OWNER_KEY),
            attestor: address(0xA771),
            reviewer: vm.addr(REVIEWER_KEY),
            ownerProfile: 1,
            releasePolicy: 0,
            startingDeployerNonce: 18,
            deploymentBatchHash: keccak256("five-contract inactive batch"),
            reviewPackageSha256: keccak256("review package sha256"),
            independentReviewReportSha256: keccak256("independent review report sha256"),
            maxFeePerGasWei: 500_000_000,
            maxTotalFeeWei: 20_000_000_000_000,
            expiresAt: NOW + 1 hours
        });
    }

    function _sign(MainnetDeploymentApprovalHarness harness, MainnetDeploymentApproval.Record memory record)
        private
        pure
        returns (bytes memory reviewSignature, bytes memory ownerSignature)
    {
        reviewSignature = _signature(REVIEWER_KEY, harness.reviewDigest(record));
        ownerSignature = _signature(OWNER_KEY, harness.ownerDigest(record));
    }

    function _signature(uint256 key, bytes32 digest) private pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _personalSignDigest(bytes32 message) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));
    }
}
