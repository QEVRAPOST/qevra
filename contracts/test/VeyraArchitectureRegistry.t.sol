// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraTokenPolicyRegistry} from "../src/policy/VeyraTokenPolicyRegistry.sol";
import {VeyraRouterRegistry} from "../src/policy/VeyraRouterRegistry.sol";
import {VeyraResearchAttestationRegistry} from "../src/research/VeyraResearchAttestationRegistry.sol";
import {VeyraAccessManaged} from "../src/access/VeyraAccessManaged.sol";

interface VmVeyraRegistry {
    function expectRevert(bytes calldata revertData) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter) external;
    function prank(address sender) external;
    function deal(address account, uint256 newBalance) external;
}

event AttestationRecorded(
    bytes32 indexed attestationId,
    bytes32 indexed reportDigest,
    bytes32 indexed runId,
    bytes32 manifestDigest,
    address attestor,
    uint256 attestedAt
);

contract RegistryTokenMock {
    function decimals() external pure returns (uint8) {
        return 6;
    }
}

contract RegistryRouterMock {
    function route() external pure returns (uint256) {
        return 1;
    }
}

contract VeyraArchitectureRegistryTest {
    VmVeyraRegistry private constant vm = VmVeyraRegistry(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant NON_OWNER = address(0xBEEF);
    address private constant ATTESTOR = address(0xA770);

    function test_tokenRegistryPinsReviewedExactTransferToken() public {
        VeyraTokenPolicyRegistry registry = new VeyraTokenPolicyRegistry();
        RegistryTokenMock token = new RegistryTokenMock();

        registry.setTokenPolicy(address(token), 6, true);

        (bool enabled, uint8 decimals_, bool exactTransfer, bytes32 codeHash) = registry.getTokenPolicy(address(token));
        require(enabled, "token should be enabled");
        require(decimals_ == 6, "decimals should be stored");
        require(exactTransfer, "exact transfer policy should be stored");
        require(codeHash == address(token).codehash, "token runtime hash should be pinned");
    }

    function test_tokenRegistryRejectsUnauthorizedAndUnreviewedToken() public {
        VeyraTokenPolicyRegistry registry = new VeyraTokenPolicyRegistry();
        RegistryTokenMock token = new RegistryTokenMock();

        vm.expectRevert(abi.encodeWithSelector(VeyraAccessManaged.Unauthorized.selector, NON_OWNER));
        vm.prank(NON_OWNER);
        registry.setTokenPolicy(address(token), 6, true);

        vm.expectRevert(abi.encodeWithSelector(VeyraTokenPolicyRegistry.UnsupportedTransferSemantics.selector));
        registry.setTokenPolicy(address(token), 6, false);
    }

    function test_routerRegistryRequiresAndChecksExactRuntimeHash() public {
        VeyraRouterRegistry registry = new VeyraRouterRegistry();
        RegistryRouterMock router = new RegistryRouterMock();
        bytes32 runtimeHash = address(router).codehash;

        vm.expectRevert(
            abi.encodeWithSelector(
                VeyraRouterRegistry.RuntimeCodeHashMismatch.selector, bytes32(uint256(1)), runtimeHash
            )
        );
        registry.setRouter(address(router), bytes32(uint256(1)));

        registry.setRouter(address(router), runtimeHash);
        (bool enabled, bytes32 storedHash) = registry.getRouter(address(router));
        require(enabled && storedHash == runtimeHash, "router code hash should be pinned");
    }

    function test_routerRegistryIsOwnerControlled() public {
        VeyraRouterRegistry registry = new VeyraRouterRegistry();
        RegistryRouterMock router = new RegistryRouterMock();

        vm.expectRevert(abi.encodeWithSelector(VeyraAccessManaged.Unauthorized.selector, NON_OWNER));
        vm.prank(NON_OWNER);
        registry.setRouter(address(router), address(router).codehash);
    }

    function test_attestationRegistryRecordsDeduplicatedDigestOnlyAttestations() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(ATTESTOR);
        _setAttestationPublishingEnabled(registry, true);
        bytes32 reportDigest = keccak256("report");
        bytes32 manifestDigest = keccak256("manifest");
        bytes32 runId = keccak256("run");

        vm.prank(ATTESTOR);
        bytes32 id = registry.attest(reportDigest, manifestDigest, runId);
        VeyraResearchAttestationRegistry.Attestation memory value = registry.getAttestation(id);
        require(value.exists, "attestation should exist");
        require(value.reportDigest == reportDigest, "report digest should be retained");
        require(value.manifestDigest == manifestDigest, "manifest digest should be retained");
        require(value.runId == runId, "run id should be retained");
        require(value.attestor == ATTESTOR, "attestor should be recorded");
        require(value.attestedAt == block.timestamp, "timestamp should be recorded");

        address secondAttestor = address(0xA771);
        registry.grantRole(registry.ATTESTOR_ROLE(), secondAttestor);
        vm.expectRevert(abi.encodeWithSelector(VeyraResearchAttestationRegistry.DuplicateRun.selector, runId));
        vm.prank(secondAttestor);
        registry.attest(keccak256("other report"), manifestDigest, runId);
    }

    function test_attestationRegistryRequiresAuthorizedAttestorAndNonzeroDigests() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(address(this));
        bytes32 digest = keccak256("digest");
        bytes32 runId = keccak256("run");

        vm.expectRevert(
            abi.encodeWithSelector(VeyraResearchAttestationRegistry.UnauthorizedAttestor.selector, NON_OWNER)
        );
        vm.prank(NON_OWNER);
        registry.attest(digest, digest, runId);

        _setAttestationPublishingEnabled(registry, true);
        vm.expectRevert(abi.encodeWithSelector(VeyraResearchAttestationRegistry.ZeroDigest.selector));
        registry.attest(bytes32(0), digest, runId);
    }

    function test_attestationRegistryStartsDisabledUntilOwnerApprovesPublication() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(ATTESTOR);
        require(!_attestationPublishingEnabled(registry), "publication must start disabled");

        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("AttestationsDisabled()"))));
        vm.prank(ATTESTOR);
        registry.attest(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)));

        (bool ownerEnabled,) =
            address(registry).call(abi.encodeWithSignature("setAttestationPublishingEnabled(bool)", true));
        require(ownerEnabled && _attestationPublishingEnabled(registry), "owner should explicitly enable publication");

        vm.prank(ATTESTOR);
        registry.attest(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)));

        (bool ownerDisabled,) =
            address(registry).call(abi.encodeWithSignature("setAttestationPublishingEnabled(bool)", false));
        require(
            ownerDisabled && !_attestationPublishingEnabled(registry), "owner should be able to disable publication"
        );
    }

    function test_attestationRegistryPublicationSwitchRemainsOwnerControlled() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(ATTESTOR);

        vm.prank(NON_OWNER);
        (bool changed,) = address(registry).call(abi.encodeWithSignature("setAttestationPublishingEnabled(bool)", true));
        require(!changed && !_attestationPublishingEnabled(registry), "non-owner must not enable publication");
    }

    function test_attestationRegistryRejectsZeroInitialAttestor() public {
        vm.expectRevert(abi.encodeWithSelector(VeyraAccessManaged.ZeroAddress.selector));
        new VeyraResearchAttestationRegistry(address(0));
    }

    function test_attestationRegistryStartsWithOnlyTheSelectedAttestor() public {
        address selectedAttestor = 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562;
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(selectedAttestor);
        bytes32 attestorRole = registry.ATTESTOR_ROLE();

        require(registry.hasRole(attestorRole, selectedAttestor), "selected publisher must be authorized");
        require(!registry.hasRole(attestorRole, NON_OWNER), "unlisted publisher must remain unauthorized");
        require(!registry.hasRole(attestorRole, address(0)), "zero address must not be authorized");
    }

    function test_attestationRegistryOwnerCanGrantAndRevokePublisher() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(ATTESTOR);
        address additionalAttestor = address(0xA771);
        bytes32 attestorRole = registry.ATTESTOR_ROLE();

        vm.expectRevert(abi.encodeWithSelector(VeyraAccessManaged.Unauthorized.selector, NON_OWNER));
        vm.prank(NON_OWNER);
        registry.grantRole(attestorRole, additionalAttestor);

        registry.grantRole(attestorRole, additionalAttestor);
        require(registry.hasRole(attestorRole, additionalAttestor), "owner grant should authorize publisher");

        vm.expectRevert(abi.encodeWithSelector(VeyraAccessManaged.Unauthorized.selector, NON_OWNER));
        vm.prank(NON_OWNER);
        registry.revokeRole(attestorRole, additionalAttestor);

        registry.revokeRole(attestorRole, additionalAttestor);
        require(!registry.hasRole(attestorRole, additionalAttestor), "revocation should remove publisher");
        vm.expectRevert(
            abi.encodeWithSelector(VeyraResearchAttestationRegistry.UnauthorizedAttestor.selector, additionalAttestor)
        );
        vm.prank(additionalAttestor);
        registry.attest(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)));
    }

    function test_attestationRegistryRejectsZeroManifestAndRunDigests() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(ATTESTOR);
        _setAttestationPublishingEnabled(registry, true);
        bytes32 reportDigest = bytes32(uint256(1));
        bytes32 manifestDigest = bytes32(uint256(2));
        bytes32 runId = bytes32(uint256(3));

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchAttestationRegistry.ZeroDigest.selector));
        vm.prank(ATTESTOR);
        registry.attest(reportDigest, bytes32(0), runId);

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchAttestationRegistry.ZeroDigest.selector));
        vm.prank(ATTESTOR);
        registry.attest(reportDigest, manifestDigest, bytes32(0));
    }

    function test_attestationRegistryEmitsExactDigestOnlyEvidence() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(ATTESTOR);
        _setAttestationPublishingEnabled(registry, true);
        // Test-only commitments; production publishers need high-entropy secret salts.
        bytes32 reportDigest = keccak256(abi.encode(bytes32(uint256(0x51a7)), "private report"));
        bytes32 manifestDigest = keccak256(abi.encode(bytes32(uint256(0x91c3)), "private manifest"));
        bytes32 runId = keccak256(abi.encode(bytes32(uint256(0x2e11)), "private run"));
        bytes32 expectedId =
            keccak256(abi.encode(block.chainid, address(registry), ATTESTOR, reportDigest, manifestDigest, runId));

        vm.expectEmit(true, true, true, true, address(registry));
        emit AttestationRecorded(expectedId, reportDigest, runId, manifestDigest, ATTESTOR, block.timestamp);
        vm.prank(ATTESTOR);
        bytes32 actualId = registry.attest(reportDigest, manifestDigest, runId);

        require(actualId == expectedId, "attestation id must bind the domain and digest fields");
        VeyraResearchAttestationRegistry.Attestation memory value = registry.getAttestation(actualId);
        require(value.reportDigest == reportDigest, "report content must be represented by its digest");
        require(value.manifestDigest == manifestDigest, "manifest content must be represented by its digest");
        require(value.runId == runId, "run content must be represented by its digest");
        require(value.attestor == ATTESTOR && value.exists, "authorized publisher must be attributable");
        require(value.attestedAt == block.timestamp, "event and stored timestamp must match");
    }

    function test_attestationRegistryCannotReceiveEther() public {
        VeyraResearchAttestationRegistry registry = new VeyraResearchAttestationRegistry(ATTESTOR);
        vm.deal(address(this), 1 wei);

        (bool accepted,) = address(registry).call{value: 1 wei}("");

        require(!accepted, "registry must not accept Ether");
        require(address(registry).balance == 0, "registry must not custody Ether");
    }

    function _setAttestationPublishingEnabled(VeyraResearchAttestationRegistry registry, bool enabled) private {
        (bool success,) =
            address(registry).call(abi.encodeWithSignature("setAttestationPublishingEnabled(bool)", enabled));
        require(success, "owner should be able to set publication state");
    }

    function _attestationPublishingEnabled(VeyraResearchAttestationRegistry registry) private view returns (bool) {
        (bool success, bytes memory result) =
            address(registry).staticcall(abi.encodeWithSignature("attestationPublishingEnabled()"));
        return success && result.length == 32 && abi.decode(result, (bool));
    }
}
