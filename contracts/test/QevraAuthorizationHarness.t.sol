// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {QevraAuthorizationHarness} from "../src/phase0/QevraAuthorizationHarness.sol";

interface Vm {
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
}

/// @dev Behavior stub only: accepting this stub does not test or emulate ML-DSA security.
contract VeyraHarnessMockVerifier {
    bool public accepts;

    constructor(bool accepts_) {
        accepts = accepts_;
    }

    function verify(address, bytes calldata, bytes calldata) external view returns (bool) {
        return accepts;
    }
}

contract VeyraHarnessTarget {
    uint256 public calls;

    function increment() external {
        calls += 1;
    }

    function fail() external pure {
        revert("target failure");
    }
}

contract VeyraHarnessReenteringTarget {
    bool public reentryBlocked;

    function attempt(address account, address target) external {
        try QevraAuthorizationHarness(payable(account)).execute(
            target, 0, abi.encodeCall(VeyraHarnessTarget.increment, ()), block.timestamp + 60, bytes("")
        ) {
            reentryBlocked = false;
        } catch {
            reentryBlocked = true;
        }
    }
}

/// @dev These tests exercise Phase 0 state-machine behavior using a mock verifier.
/// They do not validate signature cryptography, key registration, or production safety.
contract QevraAuthorizationHarnessTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant KEY_BLOB_SIZE = 20_545;

    function test_constructorRejectsMissingVerifierAndMalformedBlob() public {
        address blob = _deployRuntime(new bytes(KEY_BLOB_SIZE));
        vm.expectRevert(QevraAuthorizationHarness.InvalidSetup.selector);
        new QevraAuthorizationHarness(address(0xBEEF), blob);

        VeyraHarnessMockVerifier verifier = new VeyraHarnessMockVerifier(true);
        address shortBlob = _deployRuntime(new bytes(KEY_BLOB_SIZE - 1));
        vm.expectRevert(QevraAuthorizationHarness.InvalidSetup.selector);
        new QevraAuthorizationHarness(address(verifier), shortBlob);
    }

    function test_untrustedCallerCannotBypassRejectingVerifier() public {
        QevraAuthorizationHarness account = _newAccount(false);
        VeyraHarnessTarget target = new VeyraHarnessTarget();
        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        vm.prank(address(0xCAFE));
        account.execute(address(target), 0, abi.encodeCall(VeyraHarnessTarget.increment, ()), block.timestamp + 60, bytes(""));
        require(target.calls() == 0, "target must not execute");
        require(account.nonce() == 0, "rejected call must not consume nonce");
    }

    function test_relayedAcceptedCallAdvancesNonceExactlyOnce() public {
        QevraAuthorizationHarness account = _newAccount(true);
        VeyraHarnessTarget target = new VeyraHarnessTarget();
        vm.prank(address(0xCAFE));
        account.execute(address(target), 0, abi.encodeCall(VeyraHarnessTarget.increment, ()), block.timestamp + 60, bytes("mock"));
        require(target.calls() == 1, "target call count");
        require(account.nonce() == 1, "nonce advances once");
    }

    function test_reentrancyIsBlockedAndOuterExecutionCompletes() public {
        QevraAuthorizationHarness account = _newAccount(true);
        VeyraHarnessReenteringTarget reentering = new VeyraHarnessReenteringTarget();
        VeyraHarnessTarget target = new VeyraHarnessTarget();
        account.execute(
            address(reentering), 0, abi.encodeCall(VeyraHarnessReenteringTarget.attempt, (address(account), address(target))),
            block.timestamp + 60, bytes("mock")
        );
        require(reentering.reentryBlocked(), "nested execute must be rejected");
        require(target.calls() == 0, "nested target must not execute");
        require(account.nonce() == 1, "outer nonce advances once");
    }

    function test_malformedTargetCalldataRollsBackNonce() public {
        QevraAuthorizationHarness account = _newAccount(true);
        VeyraHarnessTarget target = new VeyraHarnessTarget();
        (bool success, bytes memory result) = address(account).call(abi.encodeCall(
            QevraAuthorizationHarness.execute,
            (address(target), 0, hex"deadbeef", block.timestamp + 60, bytes("mock"))
        ));
        require(!success && _selector(result) == QevraAuthorizationHarness.AuthorizedCallFailed.selector, "malformed call must fail");
        require(account.nonce() == 0, "reverted call must roll back nonce");
    }

    function test_targetRevertRollsBackNonceAndState() public {
        QevraAuthorizationHarness account = _newAccount(true);
        VeyraHarnessTarget target = new VeyraHarnessTarget();
        (bool success, bytes memory result) = address(account).call(abi.encodeCall(
            QevraAuthorizationHarness.execute,
            (address(target), 0, abi.encodeCall(VeyraHarnessTarget.fail, ()), block.timestamp + 60, bytes("mock"))
        ));
        require(!success && _selector(result) == QevraAuthorizationHarness.AuthorizedCallFailed.selector, "reverting target must fail");
        require(account.nonce() == 0, "reverted call must roll back nonce");
        require(target.calls() == 0, "reverted call must preserve target state");
    }

    function testFuzz_nonceEqualsSuccessfulExecutionCount(uint8 count) public {
        QevraAuthorizationHarness account = _newAccount(true);
        VeyraHarnessTarget target = new VeyraHarnessTarget();
        for (uint256 i; i < count; ++i) {
            account.execute(address(target), 0, abi.encodeCall(VeyraHarnessTarget.increment, ()), block.timestamp + 60, bytes("mock"));
            require(account.nonce() == i + 1, "nonce must be monotonic");
        }
        require(target.calls() == count, "successful execution count must match nonce");
    }

    function _newAccount(bool accepts) private returns (QevraAuthorizationHarness) {
        VeyraHarnessMockVerifier verifier = new VeyraHarnessMockVerifier(accepts);
        address blob = _deployRuntime(new bytes(KEY_BLOB_SIZE));
        return new QevraAuthorizationHarness(address(verifier), blob);
    }

    function _deployRuntime(bytes memory runtime) private returns (address deployed) {
        bytes memory initCode = abi.encodePacked(
            bytes1(0x61), uint16(runtime.length), hex"600e600039", bytes1(0x61), uint16(runtime.length), hex"6000f3", runtime
        );
        assembly ("memory-safe") {
            deployed := create(0, add(initCode, 32), mload(initCode))
        }
        require(deployed != address(0), "test bytecode deployment failed");
    }

    function _selector(bytes memory result) private pure returns (bytes4 value) {
        if (result.length < 4) return bytes4(0);
        assembly ("memory-safe") {
            value := mload(add(result, 32))
        }
    }
}
