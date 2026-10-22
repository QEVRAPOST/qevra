// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraResearchAttestationRegistry} from "../src/research/VeyraResearchAttestationRegistry.sol";

interface VmVeyraAttestationDeploy {
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Deploys the dormant, digest-only attestation registry on Robinhood Testnet.
/// @dev The existing Testnet deployer is the owner and sole initial attestor. This script never grants roles.
contract DeployVeyraResearchAttestationRegistry {
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = 46630;
    address public constant EXPECTED_DEPLOYER = 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562;

    error WrongChain(uint256 actualChainId);
    error UnexpectedDeployer(address actualDeployer);
    error RegistryOwnerMismatch(address expected, address observed);
    error InitialAttestorNotAuthorized(address attestor);
    error UnexpectedAdditionalAttestor(address attestor);
    error InvalidDeploymentCode(address deployed);

    VmVeyraAttestationDeploy private constant vm =
        VmVeyraAttestationDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    event VeyraResearchAttestationRegistryDeployed(
        address indexed registry,
        address indexed owner,
        address indexed initialAttestor,
        bytes32 runtimeBytecodeHash
    );

    function run()
        external
        returns (VeyraResearchAttestationRegistry registry, bytes32 runtimeBytecodeHash)
    {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (tx.origin != EXPECTED_DEPLOYER) revert UnexpectedDeployer(tx.origin);

        vm.startBroadcast();
        registry = new VeyraResearchAttestationRegistry(EXPECTED_DEPLOYER);
        vm.stopBroadcast();

        _requireCode(address(registry));
        address observedOwner = registry.owner();
        if (observedOwner != EXPECTED_DEPLOYER) {
            revert RegistryOwnerMismatch(EXPECTED_DEPLOYER, observedOwner);
        }

        bytes32 attestorRole = registry.ATTESTOR_ROLE();
        if (!registry.hasRole(attestorRole, EXPECTED_DEPLOYER)) {
            revert InitialAttestorNotAuthorized(EXPECTED_DEPLOYER);
        }
        if (registry.hasRole(attestorRole, address(0))) {
            revert UnexpectedAdditionalAttestor(address(0));
        }

        runtimeBytecodeHash = address(registry).codehash;
        emit VeyraResearchAttestationRegistryDeployed(
            address(registry), observedOwner, EXPECTED_DEPLOYER, runtimeBytecodeHash
        );
    }

    function _requireCode(address deployed) private view {
        if (deployed.code.length == 0) revert InvalidDeploymentCode(deployed);
    }
}
