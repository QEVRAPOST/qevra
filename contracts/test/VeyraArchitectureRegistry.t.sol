// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraTokenPolicyRegistry} from "../src/policy/VeyraTokenPolicyRegistry.sol";
import {VeyraRouterRegistry} from "../src/policy/VeyraRouterRegistry.sol";
import {VeyraResearchAttestationRegistry} from "../src/research/VeyraResearchAttestationRegistry.sol";
import {VeyraAccessManaged} from "../src/access/VeyraAccessManaged.sol";

interface VmVeyraRegistry {
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender) external;
}

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

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchAttestationRegistry.DuplicateRun.selector, runId));
        vm.prank(ATTESTOR);
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

        vm.expectRevert(abi.encodeWithSelector(VeyraResearchAttestationRegistry.ZeroDigest.selector));
        registry.attest(bytes32(0), digest, runId);
    }
}
