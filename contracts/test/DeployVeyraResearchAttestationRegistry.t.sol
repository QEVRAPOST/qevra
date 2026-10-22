// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeployVeyraResearchAttestationRegistry} from "../script/DeployVeyraResearchAttestationRegistry.s.sol";

interface VmVeyraAttestationScript {
    function chainId(uint256 newChainId) external;
    function expectRevert(bytes calldata revertData) external;
    function prank(address sender, address origin) external;
}

contract DeployVeyraResearchAttestationRegistryTest {
    VmVeyraAttestationScript private constant vm =
        VmVeyraAttestationScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_refusesEveryChainOtherThanRobinhoodTestnetBeforeBroadcast() public {
        vm.chainId(4663);
        DeployVeyraResearchAttestationRegistry script = new DeployVeyraResearchAttestationRegistry();

        vm.expectRevert(abi.encodeWithSelector(DeployVeyraResearchAttestationRegistry.WrongChain.selector, 4663));
        script.run();
    }

    function test_refusesUnexpectedDeployerBeforeBroadcast() public {
        vm.chainId(46630);
        DeployVeyraResearchAttestationRegistry script = new DeployVeyraResearchAttestationRegistry();

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployVeyraResearchAttestationRegistry.UnexpectedDeployer.selector,
                address(0xBEEF)
            )
        );
        vm.prank(address(0xBEEF), address(0xBEEF));
        script.run();
    }
}
