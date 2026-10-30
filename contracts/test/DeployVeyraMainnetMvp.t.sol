// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeployVeyraMainnetMvp} from "../script/DeployVeyraMainnetMvp.s.sol";

interface VmVeyraMainnetDeployTest {
    function chainId(uint256 newChainId) external;
    function etch(address target, bytes calldata code) external;
    function expectRevert() external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender, address origin) external;
}

contract MainnetSafeOwnerFixture {
    bytes32 private constant FALLBACK_HANDLER_SLOT = 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;
    bytes32 private constant GUARD_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
    bytes32 private constant MODULE_GUARD_SLOT = 0xb104e0b93118902c651344349b610029d694cfdec91c589c91ebafbcd0289947;

    address private immutable _singleton;
    uint256 private immutable _threshold;
    address private immutable _guard;
    address private immutable _fallbackHandler;
    address private immutable _moduleGuard;
    address[] private _owners;
    address[] private _modules;

    constructor(
        address singleton,
        address[] memory owners,
        uint256 threshold,
        address[] memory modules,
        address guard,
        address fallbackHandler,
        address moduleGuard
    ) {
        _singleton = singleton;
        _threshold = threshold;
        _guard = guard;
        _fallbackHandler = fallbackHandler;
        _moduleGuard = moduleGuard;
        _owners = owners;
        _modules = modules;
    }

    function masterCopy() external view returns (address) {
        return _singleton;
    }

    function VERSION() external pure returns (string memory) {
        return "1.4.1";
    }

    function getOwners() external view returns (address[] memory) {
        return _owners;
    }

    function getThreshold() external view returns (uint256) {
        return _threshold;
    }

    function getModulesPaginated(address, uint256) external view returns (address[] memory, address) {
        return (_modules, address(1));
    }

    function getStorageAt(uint256 offset, uint256) external view returns (bytes memory) {
        bytes32 value;
        if (bytes32(offset) == FALLBACK_HANDLER_SLOT) value = bytes32(uint256(uint160(_fallbackHandler)));
        else if (bytes32(offset) == GUARD_SLOT) value = bytes32(uint256(uint160(_guard)));
        else if (bytes32(offset) == MODULE_GUARD_SLOT) value = bytes32(uint256(uint160(_moduleGuard)));
        return abi.encode(value);
    }
}

contract DeployVeyraMainnetMvpTest {
    VmVeyraMainnetDeployTest private constant vm =
        VmVeyraMainnetDeployTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant MAINNET_DEPLOYER = address(0xCAFE);
    address private constant TESTNET_DEPLOYER = 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562;
    address private constant ATTESTOR = address(0xA771);
    address private constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    address private constant SAFE_FALLBACK_HANDLER = 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99;

    function test_deploymentBatchHashBindsRuntimeRolesAndStartingNonce() public {
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        DeployVeyraMainnetMvp.OwnerProfile profile = DeployVeyraMainnetMvp.OwnerProfile.EOA_INACTIVE;
        address owner = address(0xE0A);
        DeployVeyraMainnetMvp.ReleasePolicy releasePolicy =
        DeployVeyraMainnetMvp.ReleasePolicy.INDEPENDENT_REVIEW_REQUIRED;
        bytes32 original =
            script.mainnetDeploymentBatchHash(MAINNET_DEPLOYER, owner, ATTESTOR, profile, releasePolicy, 17);
        bytes32 same = script.mainnetDeploymentBatchHash(MAINNET_DEPLOYER, owner, ATTESTOR, profile, releasePolicy, 17);
        bytes32 changedNonce =
            script.mainnetDeploymentBatchHash(MAINNET_DEPLOYER, owner, ATTESTOR, profile, releasePolicy, 18);
        bytes32 changedOwner =
            script.mainnetDeploymentBatchHash(MAINNET_DEPLOYER, address(0xE0B), ATTESTOR, profile, releasePolicy, 17);

        require(original == same, "batch hash should be stable for the same script and plan");
        require(original != changedNonce, "batch hash must bind the deployer nonce");
        require(original != changedOwner, "batch hash must bind the owner");
    }

    function test_deploymentBatchHashBindsTheExplicitReleasePolicy() public {
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address owner = address(0xE0A);
        bytes32 reviewBatch = script.mainnetDeploymentBatchHash(
            MAINNET_DEPLOYER,
            owner,
            ATTESTOR,
            DeployVeyraMainnetMvp.OwnerProfile.EOA_INACTIVE,
            DeployVeyraMainnetMvp.ReleasePolicy.INDEPENDENT_REVIEW_REQUIRED,
            17
        );
        bytes32 ownerRiskBatch = script.mainnetDeploymentBatchHash(
            MAINNET_DEPLOYER,
            owner,
            ATTESTOR,
            DeployVeyraMainnetMvp.OwnerProfile.EOA_INACTIVE,
            DeployVeyraMainnetMvp.ReleasePolicy.OWNER_APPROVED_DORMANT,
            17
        );

        require(reviewBatch != ownerRiskBatch, "release policy must be bound into the deployment batch hash");
    }

    function test_refusesEveryChainOtherThanRobinhoodMainnetBeforeBroadcast() public {
        vm.chainId(46_630);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();

        vm.expectRevert(abi.encodeWithSelector(DeployVeyraMainnetMvp.WrongChain.selector, 46_630));
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, address(this), ATTESTOR);
    }

    function test_rejectsReuseOfTheTestnetDeployer() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();

        vm.expectRevert(abi.encodeWithSelector(DeployVeyraMainnetMvp.TestnetDeployerReuse.selector));
        vm.prank(TESTNET_DEPLOYER, TESTNET_DEPLOYER);
        script.validateDeploymentConfiguration(TESTNET_DEPLOYER, address(this), ATTESTOR);
    }

    function test_rejectsAConfiguredDeployerDifferentFromTheBroadcastSigner() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();

        vm.expectRevert(
            abi.encodeWithSelector(DeployVeyraMainnetMvp.UnexpectedDeployer.selector, MAINNET_DEPLOYER, address(0xBEEF))
        );
        vm.prank(address(0xBEEF), address(0xBEEF));
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, address(this), ATTESTOR);
    }

    function test_requiresASeparateContractOwner() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();

        vm.expectRevert(abi.encodeWithSelector(DeployVeyraMainnetMvp.OwnerMustBeContract.selector, address(0xBEEF)));
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, address(0xBEEF), ATTESTOR);
    }

    function test_acceptsNoCodeOwnerOnlyThroughExplicitEoaInactiveProfile() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();

        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        (bool accepted,) = address(script)
            .call(
                abi.encodeWithSignature(
                    "validateDeploymentConfiguration(address,address,address,uint8)",
                    MAINNET_DEPLOYER,
                    address(0xE0A),
                    ATTESTOR,
                    uint8(1)
                )
            );
        require(accepted, "explicit EOA_INACTIVE profile should accept a distinct no-code owner");
    }

    function test_safeProfileStillRejectsNoCodeOwner() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();

        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        (bool accepted,) = address(script)
            .call(
                abi.encodeWithSignature(
                    "validateDeploymentConfiguration(address,address,address,uint8)",
                    MAINNET_DEPLOYER,
                    address(0xE0A),
                    ATTESTOR,
                    uint8(0)
                )
            );
        require(!accepted, "SAFE_2_OF_3 profile must keep Safe validation");
    }

    function test_eoaInactiveProfileRejectsContractOwnerAndInvalidProfile() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address safeOwner = _safeOwner(2, new address[](0), address(0), address(0));

        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        (bool acceptedContract,) = address(script)
            .call(
                abi.encodeWithSignature(
                    "validateDeploymentConfiguration(address,address,address,uint8)",
                    MAINNET_DEPLOYER,
                    safeOwner,
                    ATTESTOR,
                    uint8(1)
                )
            );
        require(!acceptedContract, "EOA_INACTIVE profile must reject contract code");

        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        (bool acceptedUnknownProfile,) = address(script)
            .call(
                abi.encodeWithSignature(
                    "validateDeploymentConfiguration(address,address,address,uint8)",
                    MAINNET_DEPLOYER,
                    address(0xE0A),
                    ATTESTOR,
                    uint8(2)
                )
            );
        require(!acceptedUnknownProfile, "unknown owner profiles must fail closed");
    }

    function test_eoaInactiveProfileRejectsOwnerRoleOverlap() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();

        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        (bool accepted,) = address(script)
            .call(
                abi.encodeWithSignature(
                    "validateDeploymentConfiguration(address,address,address,uint8)",
                    MAINNET_DEPLOYER,
                    ATTESTOR,
                    ATTESTOR,
                    uint8(1)
                )
            );
        require(!accepted, "owner and attestor must be independently addressed");
    }

    function test_rejectsZeroAttestor() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address owner = _safeOwner(2, new address[](0), address(0), address(0));

        vm.expectRevert(abi.encodeWithSelector(DeployVeyraMainnetMvp.InvalidAttestor.selector));
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, owner, address(0));
    }

    function test_acceptsMainnetWithDistinctDeployerContractOwnerAndAttestor() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address owner = _safeOwner(2, new address[](0), address(0), address(0));

        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, owner, ATTESTOR);
    }

    function test_rejectsOwnerThatIsNotAnInitializedTwoOfThreeSafe() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address owner = _safeOwner(1, new address[](0), address(0), address(0));

        vm.expectRevert();
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, owner, ATTESTOR);
    }

    function test_rejectsSafeWithAnyEnabledModule() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address[] memory modules = new address[](1);
        modules[0] = address(0xBEEF);
        address owner = _safeOwner(2, modules, address(0), address(0));

        vm.expectRevert();
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, owner, ATTESTOR);
    }

    function test_rejectsSafeWithUnexpectedGuardOrFallbackHandler() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address badGuardOwner = _safeOwner(2, new address[](0), address(0xBEEF), address(0));
        vm.expectRevert();
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, badGuardOwner, ATTESTOR);

        address badFallbackOwner = _safeOwnerWithFallback(2, new address[](0), address(0), address(0xBEEF));
        vm.expectRevert();
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, badFallbackOwner, ATTESTOR);
    }

    function test_rejectsSafeSignerOverlapWithDeployerOrAttestor() public {
        vm.chainId(4_663);
        DeployVeyraMainnetMvp script = new DeployVeyraMainnetMvp();
        address[] memory signers = new address[](3);
        signers[0] = MAINNET_DEPLOYER;
        signers[1] = address(0x1002);
        signers[2] = address(0x1003);
        address owner = _safeOwnerWithSigners(2, signers);

        vm.expectRevert();
        vm.prank(MAINNET_DEPLOYER, MAINNET_DEPLOYER);
        script.validateDeploymentConfiguration(MAINNET_DEPLOYER, owner, ATTESTOR);
    }

    function _safeOwner(uint256 threshold, address[] memory modules, address guard, address moduleGuard)
        private
        returns (address)
    {
        address[] memory signers = new address[](3);
        signers[0] = address(0x1001);
        signers[1] = address(0x1002);
        signers[2] = address(0x1003);
        return _safeOwnerWithConfig(threshold, signers, modules, guard, SAFE_FALLBACK_HANDLER, moduleGuard);
    }

    function _safeOwnerWithFallback(uint256 threshold, address[] memory modules, address guard, address fallbackHandler)
        private
        returns (address)
    {
        address[] memory signers = new address[](3);
        signers[0] = address(0x1001);
        signers[1] = address(0x1002);
        signers[2] = address(0x1003);
        return _safeOwnerWithConfig(threshold, signers, modules, guard, fallbackHandler, address(0));
    }

    function _safeOwnerWithSigners(uint256 threshold, address[] memory signers) private returns (address) {
        return _safeOwnerWithConfig(threshold, signers, new address[](0), address(0), SAFE_FALLBACK_HANDLER, address(0));
    }

    function _safeOwnerWithConfig(
        uint256 threshold,
        address[] memory signers,
        address[] memory modules,
        address guard,
        address fallbackHandler,
        address moduleGuard
    ) private returns (address) {
        vm.etch(SAFE_L2_SINGLETON, hex"60006000");
        vm.etch(SAFE_FALLBACK_HANDLER, hex"60006000");
        return address(
            new MainnetSafeOwnerFixture(
                SAFE_L2_SINGLETON, signers, threshold, modules, guard, fallbackHandler, moduleGuard
            )
        );
    }
}
