// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraTokenPolicyRegistry} from "../src/policy/VeyraTokenPolicyRegistry.sol";
import {VeyraRouterRegistry} from "../src/policy/VeyraRouterRegistry.sol";
import {VeyraSwapIntentGuard} from "../src/swap/VeyraSwapIntentGuard.sol";
import {VeyraSwapExecutor} from "../src/swap/VeyraSwapExecutor.sol";

interface VmVeyraArchitectureDeploy {
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Testnet-only deployment sequence for the dormant, non-custodial swap-policy contracts.
/// @dev No tokens or routers are configured; this script does not enable a live swap route.
contract DeployVeyraArchitecture {
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = 46630;
    address public constant EXPECTED_DEPLOYER = 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562;

    error WrongChain(uint256 actualChainId);
    error UnexpectedDeployer(address actualDeployer);
    error RegistryOwnerMismatch(address expected, address observed);
    error InvalidDeploymentCode(address deployed);

    VmVeyraArchitectureDeploy private constant vm =
        VmVeyraArchitectureDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    event ArchitectureContractDeployed(
        bytes32 indexed contractName, address indexed deployedAddress, bytes32 runtimeCodeHash
    );

    function run()
        external
        returns (
            VeyraTokenPolicyRegistry tokenPolicies,
            VeyraRouterRegistry routerRegistry,
            VeyraSwapIntentGuard intentGuard,
            VeyraSwapExecutor swapExecutor
        )
    {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) {
            revert WrongChain(block.chainid);
        }
        if (tx.origin != EXPECTED_DEPLOYER) revert UnexpectedDeployer(tx.origin);

        vm.startBroadcast();
        tokenPolicies = new VeyraTokenPolicyRegistry();
        routerRegistry = new VeyraRouterRegistry();
        intentGuard = new VeyraSwapIntentGuard(address(tokenPolicies), address(routerRegistry));
        swapExecutor = new VeyraSwapExecutor(address(intentGuard));
        intentGuard.setExecutor(address(swapExecutor));
        vm.stopBroadcast();

        _requireOwner(address(tokenPolicies), tokenPolicies.owner());
        _requireOwner(address(routerRegistry), routerRegistry.owner());
        _requireOwner(address(intentGuard), intentGuard.owner());
        _requireCode(address(intentGuard));
        _requireCode(address(swapExecutor));
        if (intentGuard.executor() != address(swapExecutor)) revert InvalidDeploymentCode(address(intentGuard));

        emit ArchitectureContractDeployed(
            "VeyraTokenPolicyRegistry", address(tokenPolicies), address(tokenPolicies).codehash
        );
        emit ArchitectureContractDeployed(
            "VeyraRouterRegistry", address(routerRegistry), address(routerRegistry).codehash
        );
        emit ArchitectureContractDeployed("VeyraSwapIntentGuard", address(intentGuard), address(intentGuard).codehash);
        emit ArchitectureContractDeployed("VeyraSwapExecutor", address(swapExecutor), address(swapExecutor).codehash);
    }

    function _requireOwner(address deployed, address observedOwner) private view {
        if (observedOwner != EXPECTED_DEPLOYER) revert RegistryOwnerMismatch(EXPECTED_DEPLOYER, observedOwner);
        _requireCode(deployed);
    }

    function _requireCode(address deployed) private view {
        if (deployed.code.length == 0) revert InvalidDeploymentCode(deployed);
    }
}
