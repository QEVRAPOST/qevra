// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {DeployVeyraResearchEvidenceAnchor} from "../script/DeployVeyraResearchEvidenceAnchor.s.sol";

interface VmEvidenceAnchorScript {
    function chainId(uint256 newChainId) external;
    function expectRevert(bytes calldata revertData) external;
}

contract DeployVeyraResearchEvidenceAnchorTest {
    VmEvidenceAnchorScript private constant vm = VmEvidenceAnchorScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_refusesWrongChainBeforeBroadcast() public {
        vm.chainId(4663);
        DeployVeyraResearchEvidenceAnchor script = new DeployVeyraResearchEvidenceAnchor();

        vm.expectRevert(abi.encodeWithSelector(DeployVeyraResearchEvidenceAnchor.WrongChain.selector, 4663));
        script.run();
    }
}
