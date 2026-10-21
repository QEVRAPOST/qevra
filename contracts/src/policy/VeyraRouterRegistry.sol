// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraAccessManaged} from "../access/VeyraAccessManaged.sol";

/// @notice Owner-managed allowlist pinning a router to its current deployed runtime code hash.
/// @dev A matching hash does not prove that a router is safe; activation requires independent review.
contract VeyraRouterRegistry is VeyraAccessManaged {
    struct RouterPolicy {
        bytes32 codeHash;
        bool enabled;
    }

    mapping(address router => RouterPolicy policy) private _policies;

    error InvalidRouter(address router);
    error RuntimeCodeHashMismatch(bytes32 expected, bytes32 observed);
    error RouterNotEnabled(address router);
    error RouterCodeHashChanged(address router, bytes32 expected, bytes32 observed);

    event RouterPolicySet(address indexed router, bytes32 indexed codeHash);
    event RouterPolicyDisabled(address indexed router);

    function setRouter(address router, bytes32 expectedCodeHash) external onlyOwner {
        if (router == address(0) || router.code.length == 0) revert InvalidRouter(router);
        bytes32 observed = router.codehash;
        if (observed != expectedCodeHash) revert RuntimeCodeHashMismatch(expectedCodeHash, observed);
        _policies[router] = RouterPolicy({codeHash: observed, enabled: true});
        emit RouterPolicySet(router, observed);
    }

    function disableRouter(address router) external onlyOwner {
        if (!_policies[router].enabled) revert RouterNotEnabled(router);
        _policies[router].enabled = false;
        emit RouterPolicyDisabled(router);
    }

    function getRouter(address router) external view returns (bool enabled, bytes32 codeHash) {
        RouterPolicy memory policy = _policies[router];
        if (!policy.enabled) revert RouterNotEnabled(router);
        bytes32 observed = router.codehash;
        if (observed != policy.codeHash) revert RouterCodeHashChanged(router, policy.codeHash, observed);
        return (true, policy.codeHash);
    }
}
