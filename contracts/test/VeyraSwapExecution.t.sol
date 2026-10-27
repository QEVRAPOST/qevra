// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {VeyraTokenPolicyRegistry} from "../src/policy/VeyraTokenPolicyRegistry.sol";
import {VeyraRouterRegistry} from "../src/policy/VeyraRouterRegistry.sol";
import {VeyraSwapIntentGuard} from "../src/swap/VeyraSwapIntentGuard.sol";
import {VeyraSwapExecutor} from "../src/swap/VeyraSwapExecutor.sol";

interface VmVeyraSwap {
    function expectRevert() external;
    function expectRevert(bytes calldata revertData) external;
    function warp(uint256 timestamp) external;
    function roll(uint256 blockNumber) external;
    function prank(address sender) external;
}

contract SwapTokenMock {
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract SwapRouterMock {
    function swapExactTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        address recipient,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "expired");
        require(SwapTokenMock(tokenIn).transferFrom(msg.sender, address(this), amountIn), "input transfer");
        amountOut = amountIn * 2;
        require(amountOut >= minimumOut, "minimum output");
        require(SwapTokenMock(tokenOut).transfer(recipient, amountOut), "output transfer");
    }
}

contract VeyraSwapExecutionTest {
    VmVeyraSwap private constant vm = VmVeyraSwap(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant AMOUNT_IN = 100;
    uint256 private constant MINIMUM_OUT = 190;

    function test_intentLockExecutesExactlyOnceWithNoExecutorResidue() public {
        (
            VeyraSwapIntentGuard guard,
            VeyraSwapExecutor executor,
            SwapTokenMock tokenIn,
            SwapTokenMock tokenOut,
            SwapRouterMock router
        ) = _setup();
        VeyraSwapIntentGuard.SwapIntent memory intent = _intent(tokenIn, tokenOut, router, 0);
        tokenIn.mint(address(this), AMOUNT_IN);
        tokenIn.approve(address(executor), AMOUNT_IN);
        tokenOut.mint(address(router), 200);

        guard.lockIntent(intent);
        uint256 received = executor.execute(intent);

        require(received == 200, "reported output should match exact recipient delta");
        require(tokenOut.balanceOf(address(this)) == 200, "recipient should receive output");
        require(tokenIn.balanceOf(address(this)) == 0, "all approved input should be consumed");
        require(tokenIn.balanceOf(address(executor)) == 0, "executor must not retain input");
        require(!guard.isIntentLocked(address(this), 0), "successful execution should consume lock");
    }

    function test_executorCannotRunWithoutFreshAccountIntentLock() public {
        (
            VeyraSwapIntentGuard guard,
            VeyraSwapExecutor executor,
            SwapTokenMock tokenIn,
            SwapTokenMock tokenOut,
            SwapRouterMock router
        ) = _setup();
        VeyraSwapIntentGuard.SwapIntent memory intent = _intent(tokenIn, tokenOut, router, 0);
        tokenIn.mint(address(this), AMOUNT_IN);
        tokenIn.approve(address(executor), AMOUNT_IN);

        vm.expectRevert(abi.encodeWithSelector(VeyraSwapIntentGuard.IntentNotLocked.selector, address(this), 0));
        executor.execute(intent);
        require(guard.nextNonce(address(this)) == 0, "failed execution must not consume account nonce");
    }

    function test_guardRejectsIntentWithWeakMinimumOutput() public {
        (VeyraSwapIntentGuard guard,, SwapTokenMock tokenIn, SwapTokenMock tokenOut, SwapRouterMock router) = _setup();
        VeyraSwapIntentGuard.SwapIntent memory intent = _intent(tokenIn, tokenOut, router, 0);
        intent.minimumAmountOut = 100;
        vm.expectRevert(abi.encodeWithSelector(VeyraSwapIntentGuard.MinimumOutputOutsideSlippage.selector));
        guard.lockIntent(intent);
    }

    function test_consumedIntentCannotBeReplayed() public {
        (
            VeyraSwapIntentGuard guard,
            VeyraSwapExecutor executor,
            SwapTokenMock tokenIn,
            SwapTokenMock tokenOut,
            SwapRouterMock router
        ) = _setup();
        VeyraSwapIntentGuard.SwapIntent memory intent = _intent(tokenIn, tokenOut, router, 0);
        tokenIn.mint(address(this), AMOUNT_IN);
        tokenIn.approve(address(executor), AMOUNT_IN);
        tokenOut.mint(address(router), 200);
        guard.lockIntent(intent);
        executor.execute(intent);

        vm.expectRevert(abi.encodeWithSelector(VeyraSwapIntentGuard.IntentNotLocked.selector, address(this), 0));
        executor.execute(intent);
    }

    function test_untrustedCallerCannotTriggerAnotherAccountsLockedIntent() public {
        (
            VeyraSwapIntentGuard guard,
            VeyraSwapExecutor executor,
            SwapTokenMock tokenIn,
            SwapTokenMock tokenOut,
            SwapRouterMock router
        ) = _setup();
        VeyraSwapIntentGuard.SwapIntent memory intent = _intent(tokenIn, tokenOut, router, 0);
        tokenIn.mint(address(this), AMOUNT_IN);
        tokenIn.approve(address(executor), AMOUNT_IN);
        tokenOut.mint(address(router), 200);

        guard.lockIntent(intent);
        vm.prank(address(0xBEEF));
        vm.expectRevert(abi.encodeWithSelector(VeyraSwapExecutor.UnauthorizedExecution.selector, address(0xBEEF)));
        executor.execute(intent);

        require(guard.isIntentLocked(address(this), 0), "unauthorized caller must not consume the lock");
        require(tokenIn.balanceOf(address(this)) == AMOUNT_IN, "unauthorized caller must not move input");
        require(tokenOut.balanceOf(address(this)) == 0, "unauthorized caller must not trigger output");

        executor.execute(intent);
        require(tokenOut.balanceOf(address(this)) == 200, "the locking account can execute its intent");
    }

    function test_lockCannotBeConsumedInALaterBlock() public {
        (
            VeyraSwapIntentGuard guard,
            VeyraSwapExecutor executor,
            SwapTokenMock tokenIn,
            SwapTokenMock tokenOut,
            SwapRouterMock router
        ) = _setup();
        VeyraSwapIntentGuard.SwapIntent memory intent = _intent(tokenIn, tokenOut, router, 0);
        tokenIn.mint(address(this), AMOUNT_IN);
        tokenIn.approve(address(executor), AMOUNT_IN);
        tokenOut.mint(address(router), 200);
        guard.lockIntent(intent);
        vm.roll(block.number + 1);

        vm.expectRevert(abi.encodeWithSelector(VeyraSwapIntentGuard.IntentLockNotFresh.selector));
        executor.execute(intent);
    }

    function _setup()
        private
        returns (
            VeyraSwapIntentGuard guard,
            VeyraSwapExecutor executor,
            SwapTokenMock tokenIn,
            SwapTokenMock tokenOut,
            SwapRouterMock router
        )
    {
        VeyraTokenPolicyRegistry tokens = new VeyraTokenPolicyRegistry();
        VeyraRouterRegistry routers = new VeyraRouterRegistry();
        tokenIn = new SwapTokenMock(18);
        tokenOut = new SwapTokenMock(6);
        router = new SwapRouterMock();
        tokens.setTokenPolicy(address(tokenIn), 18, true);
        tokens.setTokenPolicy(address(tokenOut), 6, true);
        routers.setRouter(address(router), address(router).codehash);
        guard = new VeyraSwapIntentGuard(address(tokens), address(routers));
        executor = new VeyraSwapExecutor(address(guard));
        guard.setExecutor(address(executor));
    }

    function _intent(SwapTokenMock tokenIn, SwapTokenMock tokenOut, SwapRouterMock router, uint256 nonce)
        private
        view
        returns (VeyraSwapIntentGuard.SwapIntent memory intent)
    {
        intent = VeyraSwapIntentGuard.SwapIntent({
            chainId: block.chainid,
            account: address(this),
            tokenIn: address(tokenIn),
            tokenOut: address(tokenOut),
            amountIn: AMOUNT_IN,
            quotedAmountOut: 200,
            minimumAmountOut: MINIMUM_OUT,
            recipient: address(this),
            router: address(router),
            deadline: block.timestamp + 1 hours,
            nonce: nonce,
            slippageBps: 500
        });
    }
}
