// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeployVeyraArchitecture} from "../script/DeployVeyraArchitecture.s.sol";

interface VmVeyraArchitectureScript {
    function chainId(uint256 newChainId) external;
    function expectRevert(bytes calldata revertData) external;
}

contract DeployVeyraArchitectureTest {
    VmVeyraArchitectureScript private constant vm =
        VmVeyraArchitectureScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_refusesEveryChainOtherThanRobinhoodTestnetBeforeBroadcast() public {
        vm.chainId(4663);
        DeployVeyraArchitecture script = new DeployVeyraArchitecture();

        vm.expectRevert(abi.encodeWithSelector(DeployVeyraArchitecture.WrongChain.selector, 4663));
        script.run();
    }
}
