// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraAccessManaged} from "../access/VeyraAccessManaged.sol";

/// @notice Owner-managed allowlist for tokens whose exact-transfer policy was reviewed off-chain.
/// @dev Recording a policy is an admin assertion, not an on-chain proof of token safety.
contract VeyraTokenPolicyRegistry is VeyraAccessManaged {
    struct TokenPolicy {
        uint8 decimals;
        bool exactTransfer;
        bool enabled;
        bytes32 codeHash;
    }

    mapping(address token => TokenPolicy policy) private _policies;

    error InvalidToken(address token);
    error InvalidDecimals(uint8 decimals);
    error TokenMetadataUnavailable(address token);
    error TokenDecimalsMismatch(address token, uint8 expected, uint256 observed);
    error UnsupportedTransferSemantics();
    error TokenCodeHashChanged(address token, bytes32 expected, bytes32 observed);
    error TokenNotEnabled(address token);

    event TokenPolicySet(address indexed token, uint8 decimals, bool exactTransfer, bytes32 codeHash);
    event TokenPolicyDisabled(address indexed token);

    /// @notice Add or replace the reviewed policy for an exact-transfer ERC-20 token.
    function setTokenPolicy(address token, uint8 decimals_, bool exactTransfer) external onlyOwner {
        if (token == address(0) || token.code.length == 0) revert InvalidToken(token);
        if (decimals_ > 36) revert InvalidDecimals(decimals_);
        if (!exactTransfer) revert UnsupportedTransferSemantics();

        (bool success, bytes memory result) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!success || result.length != 32) revert TokenMetadataUnavailable(token);
        uint256 observed = abi.decode(result, (uint256));
        if (observed != decimals_) revert TokenDecimalsMismatch(token, decimals_, observed);

        bytes32 codeHash = token.codehash;
        _policies[token] = TokenPolicy({decimals: decimals_, exactTransfer: true, enabled: true, codeHash: codeHash});
        emit TokenPolicySet(token, decimals_, true, codeHash);
    }

    function disableToken(address token) external onlyOwner {
        if (!_policies[token].enabled) revert TokenNotEnabled(token);
        _policies[token].enabled = false;
        emit TokenPolicyDisabled(token);
    }

    /// @notice Returns the policy only while the token runtime matches the reviewed code hash.
    function getTokenPolicy(address token)
        external
        view
        returns (bool enabled, uint8 decimals_, bool exactTransfer, bytes32 codeHash)
    {
        TokenPolicy memory policy = _policies[token];
        if (!policy.enabled) revert TokenNotEnabled(token);
        bytes32 observed = token.codehash;
        if (observed != policy.codeHash) revert TokenCodeHashChanged(token, policy.codeHash, observed);
        return (policy.enabled, policy.decimals, policy.exactTransfer, policy.codeHash);
    }
}
