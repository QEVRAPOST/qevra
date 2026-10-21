// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraResearchEvidenceAnchor} from "../src/research/VeyraResearchEvidenceAnchor.sol";

interface VmVeyraEvidenceAnchorDeploy {
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Deploys only the hash-only Evidence Anchor to Robinhood Testnet.
contract DeployVeyraResearchEvidenceAnchor {
    uint256 public constant ROBINHOOD_TESTNET_CHAIN_ID = 46630;
    address public constant EXPECTED_DEPLOYER = 0xfA142bF0383782Caa349C5C56A7B7D565eEFA562;

    error WrongChain(uint256 actualChainId);
    error UnexpectedDeployer(address actualDeployer);

    VmVeyraEvidenceAnchorDeploy private constant vm =
        VmVeyraEvidenceAnchorDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (VeyraResearchEvidenceAnchor anchor) {
        if (block.chainid != ROBINHOOD_TESTNET_CHAIN_ID) revert WrongChain(block.chainid);

        vm.startBroadcast();
        anchor = new VeyraResearchEvidenceAnchor();
        vm.stopBroadcast();

        if (anchor.owner() != EXPECTED_DEPLOYER) revert UnexpectedDeployer(anchor.owner());
    }
}
