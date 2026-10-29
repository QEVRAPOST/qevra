// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraTokenPolicyRegistry} from "../src/policy/VeyraTokenPolicyRegistry.sol";
import {VeyraRouterRegistry} from "../src/policy/VeyraRouterRegistry.sol";
import {VeyraSwapIntentGuard} from "../src/swap/VeyraSwapIntentGuard.sol";
import {VeyraSwapExecutor} from "../src/swap/VeyraSwapExecutor.sol";
import {VeyraResearchAttestationRegistry} from "../src/research/VeyraResearchAttestationRegistry.sol";
import {MainnetDeploymentApproval} from "./MainnetDeploymentApproval.sol";

interface VmVeyraMainnetDeploy {
    enum ForgeContext {
        TestGroup,
        Test,
        Coverage,
        Snapshot,
        ScriptGroup,
        ScriptDryRun,
        ScriptBroadcast,
        ScriptResume,
        Unknown
    }

    function envAddress(string calldata name) external returns (address);
    function envBytes(string calldata name) external returns (bytes memory);
    function envBytes32(string calldata name) external returns (bytes32);
    function envString(string calldata name) external returns (string memory);
    function envUint(string calldata name) external returns (uint256);
    function getNonce(address account) external view returns (uint64 nonce);
    function isContext(ForgeContext context) external view returns (bool result);
    function startBroadcast(address signer) external;
    function stopBroadcast() external;
}

interface IVeyraSafeOwnerMainnet {
    function masterCopy() external view returns (address);
    function VERSION() external view returns (string memory);
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function getModulesPaginated(address start, uint256 pageSize)
        external
        view
        returns (address[] memory modules, address next);
    function getStorageAt(uint256 offset, uint256 length) external view returns (bytes memory);
}

/// @notice Mainnet deployment path for dormant architecture slots 6–10.
/// @dev Deploys no account, token policy, or router policy and never enables a swap route.
///      Run only as a non-broadcast simulation until the owner approves the exact transaction plan.
contract DeployVeyraMainnetMvp {
    enum OwnerProfile {
        SAFE_2_OF_3,
        EOA_INACTIVE
    }

    uint256 public constant ROBINHOOD_MAINNET_CHAIN_ID = 4_663;
    uint256 public constant APPROVAL_TTL = 24 hours;
    address public constant TESTNET_DEPLOYER = 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562;
    address public constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address public constant SAFE_FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;
    bytes32 private constant FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;
    bytes32 private constant GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
    bytes32 private constant MODULE_GUARD_STORAGE_SLOT =
        0xb104e0b93118902c651344349b610029d694cfdec91c589c91ebafbcd0289947;
    address private constant SAFE_MODULE_SENTINEL = address(1);
    bytes32 private constant DEPLOYMENT_BATCH_DOMAIN = keccak256("VEYRA_ROBINHOOD_MAINNET_MVP_BATCH_V1");
    bytes32 private constant DEPLOYMENT_OPERATIONS = keccak256(
        "deploy-slots-6-10-in-order;constructor-refs-guard-to-slots-6-7;executor-to-slot-8;attestor-role-to-configured-attestor;set-slot-8-executor-to-slot-9;transfer-owner-slots-6-7-8-10;empty-token-policy;empty-router-policy;attestation-publishing-disabled"
    );

    error WrongChain(uint256 actualChainId);
    error InvalidDeployer();
    error UnexpectedDeployer(address expected, address observed);
    error TestnetDeployerReuse();
    error InvalidOwner();
    error OwnerMustBeContract(address owner);
    error OwnerMustBeEoa(address owner);
    error OwnerRoleOverlap(address owner);
    error InvalidOwnerProfile();
    error AttestationPublicationUnexpectedlyEnabled();
    error InvalidAttestor();
    error RegistryOwnerMismatch(address expected, address observed);
    error AttestorNotAuthorized(address attestor);
    error UnexpectedAdditionalAttestor(address attestor);
    error InvalidDeploymentCode(address deployed);
    error ExecutorMismatch(address expected, address observed);
    error ExecutorGuardMismatch(address expected, address observed);
    error OwnerWrongSafeImplementation(address expected, address observed);
    error OwnerWrongSafeVersion(string observed);
    error OwnerNotTwoOfThree(uint256 ownerCount, uint256 threshold);
    error OwnerInvalidSigner(address signer);
    error OwnerSignerRoleOverlap(address signer);
    error OwnerHasEnabledModules();
    error OwnerUnexpectedGuard(address guard);
    error OwnerUnexpectedModuleGuard(address guard);
    error OwnerUnexpectedFallbackHandler(address handler);
    error InvalidSafeStorage(address owner, bytes32 slot);
    error BroadcastApprovalRequired();

    VmVeyraMainnetDeploy private constant vm =
        VmVeyraMainnetDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    event MainnetMvpContractDeployed(
        uint8 indexed architectureSlot,
        bytes32 indexed contractName,
        address indexed deployedAddress,
        bytes32 runtimeCodeHash
    );
    event MainnetMvpOwnershipTransferred(uint8 indexed architectureSlot, address indexed owner);
    event MainnetMvpExecutorConfigured(address indexed guard, address indexed executor);
    event MainnetMvpApprovalContext(
        bytes32 indexed deploymentBatchHash,
        uint64 indexed startingDeployerNonce,
        address indexed owner,
        address deployer,
        address attestor
    );

    function validateDeploymentConfiguration(address deployer, address owner, address attestor) external view {
        _validateDeploymentConfiguration(deployer, owner, attestor, OwnerProfile.SAFE_2_OF_3);
    }

    function validateDeploymentConfiguration(
        address deployer,
        address owner,
        address attestor,
        OwnerProfile ownerProfile
    ) external view {
        _validateDeploymentConfiguration(deployer, owner, attestor, ownerProfile);
    }

    function run()
        external
        returns (
            VeyraTokenPolicyRegistry tokenPolicies,
            VeyraRouterRegistry routerRegistry,
            VeyraSwapIntentGuard intentGuard,
            VeyraSwapExecutor swapExecutor,
            VeyraResearchAttestationRegistry attestationRegistry
        )
    {
        address deployer = vm.envAddress("VEYRA_MAINNET_DEPLOYER");
        address owner = vm.envAddress("VEYRA_MAINNET_OWNER");
        address attestor = vm.envAddress("VEYRA_MAINNET_ATTESTOR");
        OwnerProfile ownerProfile = _parseOwnerProfile(vm.envString("VEYRA_MAINNET_OWNER_MODE"));
        _validateDeploymentConfiguration(deployer, owner, attestor, ownerProfile);

        uint64 startingDeployerNonce = vm.getNonce(deployer);
        bytes32 batchHash = _deploymentBatchHash(deployer, owner, attestor, ownerProfile, startingDeployerNonce);
        emit MainnetMvpApprovalContext(batchHash, startingDeployerNonce, owner, deployer, attestor);
        if (vm.isContext(VmVeyraMainnetDeploy.ForgeContext.ScriptBroadcast)) {
            _requireBroadcastApproval(deployer, owner, attestor, ownerProfile, startingDeployerNonce, batchHash);
        }

        vm.startBroadcast(deployer);
        tokenPolicies = new VeyraTokenPolicyRegistry();
        routerRegistry = new VeyraRouterRegistry();
        intentGuard = new VeyraSwapIntentGuard(address(tokenPolicies), address(routerRegistry));
        swapExecutor = new VeyraSwapExecutor(address(intentGuard));
        intentGuard.setExecutor(address(swapExecutor));
        attestationRegistry = new VeyraResearchAttestationRegistry(attestor);

        tokenPolicies.transferOwnership(owner);
        routerRegistry.transferOwnership(owner);
        intentGuard.transferOwnership(owner);
        attestationRegistry.transferOwnership(owner);
        vm.stopBroadcast();

        _requireOwner(address(tokenPolicies), tokenPolicies.owner(), owner);
        _requireOwner(address(routerRegistry), routerRegistry.owner(), owner);
        _requireOwner(address(intentGuard), intentGuard.owner(), owner);
        _requireOwner(address(attestationRegistry), attestationRegistry.owner(), owner);
        _requireCode(address(swapExecutor));
        if (intentGuard.executor() != address(swapExecutor)) {
            revert ExecutorMismatch(address(swapExecutor), intentGuard.executor());
        }
        if (address(swapExecutor.intentGuard()) != address(intentGuard)) {
            revert ExecutorGuardMismatch(address(intentGuard), address(swapExecutor.intentGuard()));
        }
        bytes32 attestorRole = attestationRegistry.ATTESTOR_ROLE();
        if (!attestationRegistry.hasRole(attestorRole, attestor)) revert AttestorNotAuthorized(attestor);
        if (attestationRegistry.attestationPublishingEnabled()) {
            revert AttestationPublicationUnexpectedlyEnabled();
        }
        if (attestationRegistry.hasRole(attestorRole, address(0))) {
            revert UnexpectedAdditionalAttestor(address(0));
        }

        _emitDeployment(6, "VeyraTokenPolicyRegistry", address(tokenPolicies));
        _emitDeployment(7, "VeyraRouterRegistry", address(routerRegistry));
        _emitDeployment(8, "VeyraSwapIntentGuard", address(intentGuard));
        _emitDeployment(9, "VeyraSwapExecutor", address(swapExecutor));
        _emitDeployment(10, "VeyraResearchAttestationRegistry", address(attestationRegistry));
        emit MainnetMvpExecutorConfigured(address(intentGuard), address(swapExecutor));
        emit MainnetMvpOwnershipTransferred(6, owner);
        emit MainnetMvpOwnershipTransferred(7, owner);
        emit MainnetMvpOwnershipTransferred(8, owner);
        emit MainnetMvpOwnershipTransferred(10, owner);
    }

    /// @notice Returns the source- and nonce-bound hash that review and owner approvals must sign.
    function mainnetDeploymentBatchHash(
        address deployer,
        address owner,
        address attestor,
        OwnerProfile ownerProfile,
        uint64 startingDeployerNonce
    ) external pure returns (bytes32) {
        return _deploymentBatchHash(deployer, owner, attestor, ownerProfile, startingDeployerNonce);
    }

    /// @notice Reads public role config and current Mainnet nonce, then returns the exact batch hash.
    function currentMainnetDeploymentBatchHash() external returns (bytes32 batchHash, uint64 startingDeployerNonce) {
        if (block.chainid != ROBINHOOD_MAINNET_CHAIN_ID) revert WrongChain(block.chainid);
        address deployer = vm.envAddress("VEYRA_MAINNET_DEPLOYER");
        address owner = vm.envAddress("VEYRA_MAINNET_OWNER");
        address attestor = vm.envAddress("VEYRA_MAINNET_ATTESTOR");
        OwnerProfile ownerProfile = _parseOwnerProfile(vm.envString("VEYRA_MAINNET_OWNER_MODE"));
        startingDeployerNonce = vm.getNonce(deployer);
        batchHash = _deploymentBatchHash(deployer, owner, attestor, ownerProfile, startingDeployerNonce);
    }

    /// @notice Reads the broadcast approval fields and returns canonical EIP-191 signing digests.
    function currentMainnetApprovalDigests()
        external
        returns (bytes32 batchHash, bytes32 reviewerDigest, bytes32 ownerDigest)
    {
        MainnetDeploymentApproval.Record memory record;
        (batchHash, record) = _currentMainnetApprovalRecord();
        reviewerDigest = MainnetDeploymentApproval.reviewDigest(record);
        ownerDigest = MainnetDeploymentApproval.ownerDigest(record);
    }

    /// @notice Returns the raw 32-byte messages for MetaMask `personal_sign`.
    /// @dev `personal_sign` adds the EIP-191 prefix; signatures still verify against the same digests.
    function currentMainnetPersonalSignMessages()
        external
        returns (bytes32 batchHash, bytes32 reviewerMessage, bytes32 ownerMessage)
    {
        MainnetDeploymentApproval.Record memory record;
        (batchHash, record) = _currentMainnetApprovalRecord();
        reviewerMessage = MainnetDeploymentApproval.reviewPersonalSignMessage(record);
        ownerMessage = MainnetDeploymentApproval.ownerPersonalSignMessage(record);
    }

    function _currentMainnetApprovalRecord()
        private
        returns (bytes32 batchHash, MainnetDeploymentApproval.Record memory record)
    {
        if (block.chainid != ROBINHOOD_MAINNET_CHAIN_ID) revert WrongChain(block.chainid);
        address deployer = vm.envAddress("VEYRA_MAINNET_DEPLOYER");
        address owner = vm.envAddress("VEYRA_MAINNET_OWNER");
        address attestor = vm.envAddress("VEYRA_MAINNET_ATTESTOR");
        OwnerProfile ownerProfile = _parseOwnerProfile(vm.envString("VEYRA_MAINNET_OWNER_MODE"));
        uint64 startingDeployerNonce = vm.getNonce(deployer);
        batchHash = _deploymentBatchHash(deployer, owner, attestor, ownerProfile, startingDeployerNonce);
        record = MainnetDeploymentApproval.Record({
            chainId: block.chainid,
            deployer: deployer,
            owner: owner,
            attestor: attestor,
            reviewer: vm.envAddress("VEYRA_MAINNET_REVIEWER"),
            ownerProfile: uint8(ownerProfile),
            startingDeployerNonce: startingDeployerNonce,
            deploymentBatchHash: batchHash,
            reviewPackageSha256: vm.envBytes32("VEYRA_MAINNET_REVIEW_PACKAGE_SHA256"),
            independentReviewReportSha256: vm.envBytes32("VEYRA_MAINNET_INDEPENDENT_REVIEW_SHA256"),
            maxFeePerGasWei: vm.envUint("VEYRA_MAINNET_APPROVED_MAX_FEE_PER_GAS_WEI"),
            maxTotalFeeWei: vm.envUint("VEYRA_MAINNET_APPROVED_MAX_TOTAL_FEE_WEI"),
            expiresAt: vm.envUint("VEYRA_MAINNET_APPROVAL_EXPIRES_AT")
        });
    }

    function _validateDeploymentConfiguration(
        address deployer,
        address owner,
        address attestor,
        OwnerProfile ownerProfile
    ) private view {
        if (block.chainid != ROBINHOOD_MAINNET_CHAIN_ID) revert WrongChain(block.chainid);
        if (deployer == address(0)) revert InvalidDeployer();
        if (tx.origin != deployer) revert UnexpectedDeployer(deployer, tx.origin);
        if (deployer == TESTNET_DEPLOYER) revert TestnetDeployerReuse();
        if (owner == address(0) || owner == deployer) revert InvalidOwner();
        if (attestor == address(0)) revert InvalidAttestor();
        if (owner == attestor || owner == TESTNET_DEPLOYER) revert OwnerRoleOverlap(owner);

        if (ownerProfile == OwnerProfile.SAFE_2_OF_3) {
            if (owner.code.length == 0) revert OwnerMustBeContract(owner);
            _validateSafeOwner(owner, deployer, attestor);
        } else if (ownerProfile == OwnerProfile.EOA_INACTIVE) {
            if (owner.code.length != 0) revert OwnerMustBeEoa(owner);
        } else {
            revert InvalidOwnerProfile();
        }
    }

    function _parseOwnerProfile(string memory value) private pure returns (OwnerProfile) {
        if (keccak256(bytes(value)) == keccak256("SAFE_2_OF_3")) return OwnerProfile.SAFE_2_OF_3;
        if (keccak256(bytes(value)) == keccak256("EOA_INACTIVE")) return OwnerProfile.EOA_INACTIVE;
        revert InvalidOwnerProfile();
    }

    function _deploymentBatchHash(
        address deployer,
        address owner,
        address attestor,
        OwnerProfile ownerProfile,
        uint64 startingDeployerNonce
    ) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                DEPLOYMENT_BATCH_DOMAIN,
                ROBINHOOD_MAINNET_CHAIN_ID,
                deployer,
                owner,
                attestor,
                uint8(ownerProfile),
                startingDeployerNonce,
                keccak256(type(VeyraTokenPolicyRegistry).creationCode),
                keccak256(type(VeyraRouterRegistry).creationCode),
                keccak256(type(VeyraSwapIntentGuard).creationCode),
                keccak256(type(VeyraSwapExecutor).creationCode),
                keccak256(type(VeyraResearchAttestationRegistry).creationCode),
                DEPLOYMENT_OPERATIONS
            )
        );
    }

    function _requireBroadcastApproval(
        address deployer,
        address owner,
        address attestor,
        OwnerProfile ownerProfile,
        uint64 startingDeployerNonce,
        bytes32 batchHash
    ) private {
        if (ownerProfile != OwnerProfile.EOA_INACTIVE) revert BroadcastApprovalRequired();

        MainnetDeploymentApproval.Record memory record = MainnetDeploymentApproval.Record({
            chainId: block.chainid,
            deployer: deployer,
            owner: owner,
            attestor: attestor,
            reviewer: vm.envAddress("VEYRA_MAINNET_REVIEWER"),
            ownerProfile: uint8(ownerProfile),
            startingDeployerNonce: startingDeployerNonce,
            deploymentBatchHash: batchHash,
            reviewPackageSha256: vm.envBytes32("VEYRA_MAINNET_REVIEW_PACKAGE_SHA256"),
            independentReviewReportSha256: vm.envBytes32("VEYRA_MAINNET_INDEPENDENT_REVIEW_SHA256"),
            maxFeePerGasWei: vm.envUint("VEYRA_MAINNET_APPROVED_MAX_FEE_PER_GAS_WEI"),
            maxTotalFeeWei: vm.envUint("VEYRA_MAINNET_APPROVED_MAX_TOTAL_FEE_WEI"),
            expiresAt: vm.envUint("VEYRA_MAINNET_APPROVAL_EXPIRES_AT")
        });

        MainnetDeploymentApproval.verify(
            record,
            vm.envBytes("VEYRA_MAINNET_REVIEWER_SIGNATURE"),
            vm.envBytes("VEYRA_MAINNET_OWNER_APPROVAL_SIGNATURE"),
            block.timestamp
        );
        MainnetDeploymentApproval.verifyLegacyGasPrice(tx.gasprice, record.maxFeePerGasWei);
    }

    function _validateSafeOwner(address owner, address deployer, address attestor) private view {
        IVeyraSafeOwnerMainnet safeOwner = IVeyraSafeOwnerMainnet(owner);
        address observedSingleton = safeOwner.masterCopy();
        if (observedSingleton != SAFE_L2_SINGLETON) {
            revert OwnerWrongSafeImplementation(SAFE_L2_SINGLETON, observedSingleton);
        }
        if (SAFE_L2_SINGLETON.code.length == 0) {
            revert InvalidDeploymentCode(SAFE_L2_SINGLETON);
        }
        string memory version = safeOwner.VERSION();
        if (keccak256(bytes(version)) != keccak256(bytes("1.4.1"))) revert OwnerWrongSafeVersion(version);

        address[] memory signers = safeOwner.getOwners();
        uint256 threshold = safeOwner.getThreshold();
        if (signers.length != 3 || threshold != 2) revert OwnerNotTwoOfThree(signers.length, threshold);
        for (uint256 i; i < signers.length; ++i) {
            address signer = signers[i];
            if (signer == address(0) || signer == SAFE_MODULE_SENTINEL) revert OwnerInvalidSigner(signer);
            if (signer == deployer || signer == attestor) revert OwnerSignerRoleOverlap(signer);
            for (uint256 j; j < i; ++j) {
                if (signers[j] == signer) revert OwnerInvalidSigner(signer);
            }
        }

        (address[] memory modules, address next) = safeOwner.getModulesPaginated(SAFE_MODULE_SENTINEL, 1);
        if (modules.length != 0 || next != SAFE_MODULE_SENTINEL) revert OwnerHasEnabledModules();

        address guard = _safeStorageAddress(safeOwner, owner, GUARD_STORAGE_SLOT);
        if (guard != address(0)) revert OwnerUnexpectedGuard(guard);
        address moduleGuard = _safeStorageAddress(safeOwner, owner, MODULE_GUARD_STORAGE_SLOT);
        if (moduleGuard != address(0)) revert OwnerUnexpectedModuleGuard(moduleGuard);
        address fallbackHandler = _safeStorageAddress(safeOwner, owner, FALLBACK_HANDLER_STORAGE_SLOT);
        if (fallbackHandler != SAFE_FALLBACK_HANDLER) revert OwnerUnexpectedFallbackHandler(fallbackHandler);
        if (SAFE_FALLBACK_HANDLER.code.length == 0) revert InvalidDeploymentCode(SAFE_FALLBACK_HANDLER);
    }

    function _safeStorageAddress(IVeyraSafeOwnerMainnet safeOwner, address owner, bytes32 slot)
        private
        view
        returns (address value)
    {
        bytes memory raw = safeOwner.getStorageAt(uint256(slot), 1);
        if (raw.length != 32) revert InvalidSafeStorage(owner, slot);
        bytes32 word;
        assembly ("memory-safe") {
            word := mload(add(raw, 0x20))
        }
        value = address(uint160(uint256(word)));
    }

    function _requireOwner(address deployed, address observedOwner, address expectedOwner) private view {
        _requireCode(deployed);
        if (observedOwner != expectedOwner) revert RegistryOwnerMismatch(expectedOwner, observedOwner);
    }

    function _requireCode(address deployed) private view {
        if (deployed.code.length == 0) revert InvalidDeploymentCode(deployed);
    }

    function _emitDeployment(uint8 slot, string memory name, address deployed) private {
        _requireCode(deployed);
        emit MainnetMvpContractDeployed(slot, bytes32(bytes(name)), deployed, deployed.codehash);
    }
}
