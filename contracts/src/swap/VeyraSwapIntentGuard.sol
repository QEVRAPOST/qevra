// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraAccessManaged} from "../access/VeyraAccessManaged.sol";
import {VeyraTokenPolicyRegistry} from "../policy/VeyraTokenPolicyRegistry.sol";
import {VeyraRouterRegistry} from "../policy/VeyraRouterRegistry.sol";

/// @notice Locks one exact, account-originated swap intent for a same-block executor call.
/// @dev This validates configured policy; it cannot prove that an account authenticated the caller.
contract VeyraSwapIntentGuard is VeyraAccessManaged {
    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct SwapIntent {
        uint256 chainId;
        address account;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 quotedAmountOut;
        uint256 minimumAmountOut;
        address recipient;
        address router;
        uint256 deadline;
        uint256 nonce;
        uint16 slippageBps;
    }

    VeyraTokenPolicyRegistry public immutable tokenPolicies;
    VeyraRouterRegistry public immutable routerRegistry;
    address public executor;

    mapping(address account => uint256 nonce) public nextNonce;
    mapping(bytes32 lockKey => bytes32 intentHash) private _lockedIntentHash;
    mapping(bytes32 lockKey => uint256 blockNumber) private _lockedAtBlock;

    error InvalidRegistry();
    error ExecutorAlreadySet();
    error InvalidExecutor(address executor);
    error IntentAccountMismatch(address expected, address caller);
    error WrongChain(uint256 expected, uint256 observed);
    error InvalidIntent();
    error IntentExpired(uint256 deadline);
    error InvalidSlippage(uint16 slippageBps);
    error MinimumOutputOutsideSlippage();
    error UnsupportedTokenPolicy(address token);
    error UnsupportedRouter(address router);
    error IntentNonceMismatch(address account, uint256 expected, uint256 observed);
    error IntentAlreadyLocked(address account, uint256 nonce);
    error IntentNotLocked(address account, uint256 nonce);
    error IntentHashMismatch();
    error IntentLockNotFresh();

    event ExecutorSet(address indexed executor);
    event IntentLocked(address indexed account, uint256 indexed nonce, bytes32 indexed intentHash, uint256 lockBlock);
    event IntentConsumed(address indexed account, uint256 indexed nonce, bytes32 indexed intentHash);
    event IntentCancelled(address indexed account, uint256 indexed nonce, bytes32 indexed intentHash);

    constructor(address tokenPolicyRegistry, address routerPolicyRegistry) {
        if (tokenPolicyRegistry.code.length == 0 || routerPolicyRegistry.code.length == 0) revert InvalidRegistry();
        tokenPolicies = VeyraTokenPolicyRegistry(tokenPolicyRegistry);
        routerRegistry = VeyraRouterRegistry(routerPolicyRegistry);
    }

    /// @notice Configure the single executor once; no later administrative replacement is possible.
    function setExecutor(address executor_) external onlyOwner {
        if (executor != address(0)) revert ExecutorAlreadySet();
        if (executor_ == address(0) || executor_.code.length == 0) revert InvalidExecutor(executor_);
        executor = executor_;
        emit ExecutorSet(executor_);
    }

    /// @notice Lock an intent submitted by the account, consuming its nonce before execution.
    function lockIntent(SwapIntent calldata intent) external returns (bytes32 intentHash) {
        if (intent.account != msg.sender) revert IntentAccountMismatch(intent.account, msg.sender);
        _validate(intent);
        uint256 expectedNonce = nextNonce[intent.account];
        if (intent.nonce != expectedNonce) revert IntentNonceMismatch(intent.account, expectedNonce, intent.nonce);

        bytes32 key = _lockKey(intent.account, intent.nonce);
        if (_lockedIntentHash[key] != bytes32(0)) revert IntentAlreadyLocked(intent.account, intent.nonce);
        intentHash = keccak256(abi.encode(intent));
        _lockedIntentHash[key] = intentHash;
        _lockedAtBlock[key] = block.number;
        nextNonce[intent.account] = expectedNonce + 1;
        emit IntentLocked(intent.account, intent.nonce, intentHash, block.number);
    }

    /// @notice Cancel an unconsumed lock; the account may only cancel its own intent.
    function cancelIntent(uint256 nonce) external {
        bytes32 key = _lockKey(msg.sender, nonce);
        bytes32 intentHash = _lockedIntentHash[key];
        if (intentHash == bytes32(0)) revert IntentNotLocked(msg.sender, nonce);
        delete _lockedIntentHash[key];
        delete _lockedAtBlock[key];
        emit IntentCancelled(msg.sender, nonce, intentHash);
    }

    /// @notice Consume an exact lock as the configured executor during the same block.
    function consumeIntent(SwapIntent calldata intent) external {
        if (msg.sender != executor || executor == address(0)) revert Unauthorized(msg.sender);
        _validate(intent);
        bytes32 key = _lockKey(intent.account, intent.nonce);
        bytes32 expectedHash = _lockedIntentHash[key];
        if (expectedHash == bytes32(0)) revert IntentNotLocked(intent.account, intent.nonce);
        if (expectedHash != keccak256(abi.encode(intent))) revert IntentHashMismatch();
        if (_lockedAtBlock[key] != block.number) revert IntentLockNotFresh();
        delete _lockedIntentHash[key];
        delete _lockedAtBlock[key];
        emit IntentConsumed(intent.account, intent.nonce, expectedHash);
    }

    function isIntentLocked(address account, uint256 nonce) external view returns (bool) {
        return _lockedIntentHash[_lockKey(account, nonce)] != bytes32(0);
    }

    function _validate(SwapIntent calldata intent) private view {
        if (intent.chainId != block.chainid) revert WrongChain(block.chainid, intent.chainId);
        if (
            intent.account == address(0) || intent.tokenIn == address(0) || intent.tokenOut == address(0)
                || intent.tokenIn == intent.tokenOut || intent.amountIn == 0 || intent.quotedAmountOut == 0
                || intent.minimumAmountOut == 0 || intent.recipient == address(0) || intent.router == address(0)
        ) revert InvalidIntent();
        if (block.timestamp > intent.deadline) revert IntentExpired(intent.deadline);
        if (intent.slippageBps > BPS_DENOMINATOR) revert InvalidSlippage(intent.slippageBps);
        if (intent.quotedAmountOut > type(uint256).max / BPS_DENOMINATOR) revert InvalidIntent();
        uint256 minimumAllowed = intent.quotedAmountOut * (BPS_DENOMINATOR - intent.slippageBps) / BPS_DENOMINATOR;
        if (intent.minimumAmountOut < minimumAllowed || intent.minimumAmountOut > intent.quotedAmountOut) {
            revert MinimumOutputOutsideSlippage();
        }

        (bool tokenInEnabled, uint8 tokenInDecimals, bool tokenInExact, bytes32 tokenInCodeHash) =
            tokenPolicies.getTokenPolicy(intent.tokenIn);
        (bool tokenOutEnabled, uint8 tokenOutDecimals, bool tokenOutExact, bytes32 tokenOutCodeHash) =
            tokenPolicies.getTokenPolicy(intent.tokenOut);
        if (!tokenInEnabled || !tokenInExact || tokenInDecimals > 36 || tokenInCodeHash == bytes32(0)) {
            revert UnsupportedTokenPolicy(intent.tokenIn);
        }
        if (!tokenOutEnabled || !tokenOutExact || tokenOutDecimals > 36 || tokenOutCodeHash == bytes32(0)) {
            revert UnsupportedTokenPolicy(intent.tokenOut);
        }
        (bool routerEnabled, bytes32 routerCodeHash) = routerRegistry.getRouter(intent.router);
        if (!routerEnabled || routerCodeHash == bytes32(0)) revert UnsupportedRouter(intent.router);
    }

    function _lockKey(address account, uint256 nonce) private pure returns (bytes32) {
        return keccak256(abi.encode(account, nonce));
    }
}
