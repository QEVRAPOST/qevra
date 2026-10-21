// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraSwapIntentGuard} from "./VeyraSwapIntentGuard.sol";

interface IVeyraExactSwapRouter {
    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountOut);
}

interface IVeyraSwapToken {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Executes only a same-block intent locked by VeyraSwapIntentGuard using a typed exact-swap interface.
/// @dev Input tokens are held only during this atomic call; residual input or an unexpected output reverts all effects.
contract VeyraSwapExecutor {
    VeyraSwapIntentGuard public immutable intentGuard;
    bool private _executing;

    error InvalidGuard();
    error ReentrantExecution();
    error TokenCallFailed(address token, bytes4 selector);
    error TokenBalanceReadFailed(address token);
    error UnexpectedInputResidue(uint256 expected, uint256 observed);
    error OutputBelowMinimum(uint256 minimum, uint256 observed);
    error RouterOutputMismatch(uint256 reported, uint256 observed);
    error InvalidRecipient();

    modifier nonReentrant() {
        if (_executing) revert ReentrantExecution();
        _executing = true;
        _;
        _executing = false;
    }

    event SwapExecuted(
        address indexed account,
        address indexed recipient,
        address indexed router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 nonce
    );

    constructor(address guard) {
        if (guard.code.length == 0) revert InvalidGuard();
        intentGuard = VeyraSwapIntentGuard(guard);
    }

    // The local lock is set by nonReentrant before the first external call and stays set through events.
    // forge-lint: disable-start(reentrancy-no-eth)
    // forge-lint: disable-start(reentrancy-events)
    function execute(VeyraSwapIntentGuard.SwapIntent calldata intent)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (intent.recipient == address(this)) revert InvalidRecipient();
        // The nonReentrant modifier holds the lock before this call and through the entire execution.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        intentGuard.consumeIntent(intent);

        uint256 inputBefore = _balanceOf(intent.tokenIn, address(this));
        uint256 outputBefore = _balanceOf(intent.tokenOut, intent.recipient);
        _callToken(
            intent.tokenIn,
            abi.encodeWithSelector(
                IVeyraSwapToken.transferFrom.selector, intent.account, address(this), intent.amountIn
            ),
            IVeyraSwapToken.transferFrom.selector
        );
        _callToken(
            intent.tokenIn,
            abi.encodeWithSelector(IVeyraSwapToken.approve.selector, intent.router, intent.amountIn),
            IVeyraSwapToken.approve.selector
        );

        // The lock above prevents a router callback from entering another execution.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        amountOut = IVeyraExactSwapRouter(intent.router)
            .swapExactTokensForTokens(
                intent.tokenIn,
                intent.tokenOut,
                intent.amountIn,
                intent.minimumAmountOut,
                intent.recipient,
                intent.deadline
            );

        _callToken(
            intent.tokenIn,
            abi.encodeWithSelector(IVeyraSwapToken.approve.selector, intent.router, 0),
            IVeyraSwapToken.approve.selector
        );
        uint256 inputAfter = _balanceOf(intent.tokenIn, address(this));
        if (inputAfter != inputBefore) revert UnexpectedInputResidue(inputBefore, inputAfter);
        uint256 outputAfter = _balanceOf(intent.tokenOut, intent.recipient);
        uint256 observedOut = outputAfter - outputBefore;
        if (observedOut < intent.minimumAmountOut) revert OutputBelowMinimum(intent.minimumAmountOut, observedOut);
        if (amountOut != observedOut) revert RouterOutputMismatch(amountOut, observedOut);

        // The modifier retains the lock until this post-condition event has been emitted.
        // forge-lint: disable-next-line(reentrancy-events)
        emit SwapExecuted(
            intent.account,
            intent.recipient,
            intent.router,
            intent.tokenIn,
            intent.tokenOut,
            intent.amountIn,
            amountOut,
            intent.nonce
        );
    }
    // forge-lint: disable-end(reentrancy-events)
    // forge-lint: disable-end(reentrancy-no-eth)

    function _callToken(address token, bytes memory data, bytes4 selector) private {
        // The nonReentrant lock remains held across token hooks/callbacks.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        (bool success, bytes memory result) = token.call(data);
        if (!success || (result.length != 0 && (result.length != 32 || !abi.decode(result, (bool))))) {
            revert TokenCallFailed(token, selector);
        }
    }

    function _balanceOf(address token, address account) private view returns (uint256 balance) {
        (bool success, bytes memory result) =
            token.staticcall(abi.encodeWithSelector(IVeyraSwapToken.balanceOf.selector, account));
        if (!success || result.length != 32) revert TokenBalanceReadFailed(token);
        balance = abi.decode(result, (uint256));
    }
}
