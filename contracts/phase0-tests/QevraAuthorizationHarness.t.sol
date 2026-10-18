// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test, console2} from "forge-std/Test.sol";
import {deployF1600_170} from "./ZZZ_FastKeccak170.sol";
import {shake256Batch170} from "../src/FastKeccak170.sol";
import {MLDSA44Verifier} from "../src/MLDSA44Verifier.sol";
import {QevraAuthorizationHarness} from "../src/phase0/QevraAuthorizationHarness.sol";

contract AuthorizationTarget {
    uint256 public calls;
    uint256 public valueReceived;

    function increment() external payable {
        calls += 1;
        valueReceived += msg.value;
    }

    function setCalls(uint256 nextValue) external {
        calls = nextValue;
    }
}

contract ReenteringTarget {
    bool public reentryBlocked;

    function attemptReentry(address account, address target, uint256 validUntil) external {
        try QevraAuthorizationHarness(payable(account)).execute(
            target, 0, abi.encodeCall(AuthorizationTarget.increment, ()), validUntil, bytes("")
        ) {
            reentryBlocked = false;
        } catch {
            reentryBlocked = true;
        }
    }
}

contract QevraAuthorizationHarnessTest is Test {
    string private constant PYTHON = "pythonref/myenv/bin/python";
    string private constant KEY_BLOB_GENERATOR = "tools/fixtures/e2e_pk.py";
    string private constant VECTOR_GENERATOR = "tools/fixtures/vecgen.py";
    bytes32 private constant DOMAIN_TAG = keccak256("QEVRA_MLDSA44_PHASE0_V1");

    string private keySeed;
    string private otherKeySeed;
    address private helper;
    MLDSA44Verifier private verifier;
    address private keyBlob;
    QevraAuthorizationHarness private account;
    AuthorizationTarget private target;

    function setUp() public {
        keySeed = vm.toString(keccak256(abi.encode("QEVRA phase 0 non-secret test seed", uint256(1))));
        otherKeySeed = vm.toString(keccak256(abi.encode("QEVRA phase 0 non-secret test seed", uint256(2))));
        helper = deployF1600_170();
        verifier = new MLDSA44Verifier(helper);
        keyBlob = _deployBlob(keySeed);
        account = new QevraAuthorizationHarness(address(verifier), keyBlob);
        target = new AuthorizationTarget();
    }

    function test_validMldsaAuthorizationExecutesExactIntent() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 1;
        bytes memory signature = _sign(
            keySeed,
            _message(block.chainid, address(account), 0, address(target), value, data, deadline)
        );
        vm.deal(address(account), value);

        uint256 gasBefore = gasleft();
        account.execute(address(target), value, data, deadline, signature);
        uint256 executionGas = gasBefore - gasleft();

        assertEq(target.calls(), 1);
        assertEq(target.valueReceived(), value);
        assertEq(account.nonce(), 1);
        console2.log("Phase 0 ML-DSA account execute EVM gas:", executionGas);
    }

    function test_measureLocalVerifierAndOnboardingGas() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory message =
            _message(block.chainid, address(account), 0, address(target), 0, data, deadline);
        bytes memory signature = _sign(keySeed, message);

        uint256 beforeCall = gasleft();
        assertTrue(verifier.verify(keyBlob, message, signature));
        console2.log("ML-DSA-44 verify EVM gas:", beforeCall - gasleft());

        bytes memory payload = _blobPayload(keySeed);
        uint256 keyBlobGas;
        address measuredBlob;
        (measuredBlob, keyBlobGas) = _deployDataWithGas(bytes.concat(hex"00", payload));

        uint256 helperGasStart = gasleft();
        address measurementHelper = deployF1600_170();
        uint256 helperGas = helperGasStart - gasleft();

        MLDSA44Verifier measuredVerifier = new MLDSA44Verifier(measurementHelper);

        QevraAuthorizationHarness measuredAccount =
            new QevraAuthorizationHarness(address(measuredVerifier), measuredBlob);

        console2.log("Prepared ML-DSA-44 public-key blob bytes:", measuredBlob.code.length);
        console2.log("Prepared public-key blob CREATE gas:", keyBlobGas);
        console2.log("Keccak helper runtime bytes:", measurementHelper.code.length);
        console2.log("Keccak helper CREATE gas:", helperGas);
        console2.log("Verifier runtime bytes:", address(measuredVerifier).code.length);
        console2.log("Authorization harness runtime bytes:", address(measuredAccount).code.length);
        console2.log("Measured key-blob plus helper CREATE gas:", keyBlobGas + helperGas);
    }

    function test_invalidSignatureDoesNotExecuteOrConsumeNonce() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(
            keySeed,
            _message(block.chainid, address(account), 0, address(target), 0, data, deadline)
        );
        signature[0] = bytes1(uint8(signature[0]) ^ 1);

        uint256 gasBefore = gasleft();
        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(target), 0, data, deadline, signature);
        console2.log("Invalid ML-DSA account execute EVM gas:", gasBefore - gasleft());

        assertEq(target.calls(), 0);
        assertEq(account.nonce(), 0);
    }

    function test_modifiedTargetValueOrCalldataIsRejected() public {
        bytes memory originalData = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(
            keySeed,
            _message(block.chainid, address(account), 0, address(target), 0, originalData, deadline)
        );

        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(0xBEEF), 0, originalData, deadline, signature);

        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(target), 1, originalData, deadline, signature);

        bytes memory modifiedData = abi.encodeCall(AuthorizationTarget.setCalls, (7));
        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(target), 0, modifiedData, deadline, signature);

        assertEq(target.calls(), 0);
        assertEq(account.nonce(), 0);
    }

    function test_replayAndIncorrectNonceAreRejected() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory firstSignature = _sign(
            keySeed,
            _message(block.chainid, address(account), 0, address(target), 0, data, deadline)
        );

        account.execute(address(target), 0, data, deadline, firstSignature);
        assertEq(account.nonce(), 1);

        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(target), 0, data, deadline, firstSignature);

        bytes memory futureNonceSignature = _sign(
            keySeed,
            _message(block.chainid, address(account), 2, address(target), 0, data, deadline)
        );
        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(target), 0, data, deadline, futureNonceSignature);

        assertEq(target.calls(), 1);
        assertEq(account.nonce(), 1);
    }

    function test_crossChainAndCrossAccountReplayAreRejected() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory otherChainSignature = _sign(
            keySeed,
            _message(block.chainid + 1, address(account), 0, address(target), 0, data, deadline)
        );

        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(target), 0, data, deadline, otherChainSignature);

        QevraAuthorizationHarness otherAccount =
            new QevraAuthorizationHarness(address(verifier), keyBlob);
        bytes memory otherAccountSignature = _sign(
            keySeed,
            _message(block.chainid, address(account), 0, address(target), 0, data, deadline)
        );

        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        otherAccount.execute(address(target), 0, data, deadline, otherAccountSignature);

        assertEq(target.calls(), 0);
        assertEq(account.nonce(), 0);
        assertEq(otherAccount.nonce(), 0);
    }

    function test_expiredAuthorizationIsRejected() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp - 1;
        bytes memory signature = _sign(
            keySeed,
            _message(block.chainid, address(account), 0, address(target), 0, data, deadline)
        );

        vm.expectRevert(QevraAuthorizationHarness.ExpiredAuthorization.selector);
        account.execute(address(target), 0, data, deadline, signature);

        assertEq(target.calls(), 0);
        assertEq(account.nonce(), 0);
    }

    function test_signatureFromDifferentPublicKeyIsRejected() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(
            otherKeySeed,
            _message(block.chainid, address(account), 0, address(target), 0, data, deadline)
        );

        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        account.execute(address(target), 0, data, deadline, signature);

        assertEq(target.calls(), 0);
        assertEq(account.nonce(), 0);
    }

    function test_researchOnlyAccountAcceptsForgeryForAttackerSuppliedZeroBlob() public {
        // The verifier's size gate accepts this correctly sized all-zero cache.
        // No ML-DSA private key is involved in the signature construction.
        bytes memory zeroBlob = new bytes(20_545);
        (address attackerBlob,) = _deployDataWithGas(zeroBlob);
        QevraAuthorizationHarness unvalidatedAccount =
            new QevraAuthorizationHarness(address(verifier), attackerBlob);

        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory message =
            _message(block.chainid, address(unvalidatedAccount), 0, address(target), 0, data, deadline);
        bytes memory forgedSignature = _forgeZeroCacheSignature(message);

        assertTrue(verifier.verify(attackerBlob, message, forgedSignature));
        unvalidatedAccount.execute(address(target), 0, data, deadline, forgedSignature);

        assertEq(target.calls(), 1);
        assertEq(unvalidatedAccount.nonce(), 1);
    }

    function test_conventionalCallerCannotExecuteWithoutPqSignature() public {
        bytes memory data = abi.encodeCall(AuthorizationTarget.increment, ());
        uint256 deadline = block.timestamp + 1 hours;

        vm.expectRevert(QevraAuthorizationHarness.InvalidSignature.selector);
        vm.prank(address(0xCAFE));
        account.execute(address(target), 0, data, deadline, bytes(""));

        assertEq(target.calls(), 0);
        assertEq(account.nonce(), 0);
    }

    function test_unauthorizedKeyChangeAndUpgradeSelectorsAreUnavailable() public {
        bytes memory attemptedKeyChange =
            abi.encodeWithSignature("setPublicKeyBlob(address)", address(0xBEEF));
        bytes memory attemptedUpgrade = abi.encodeWithSignature("upgradeTo(address)", address(0xBEEF));
        (bool keyChangeSucceeded,) = address(account).call(attemptedKeyChange);
        (bool upgradeSucceeded,) = address(account).call(attemptedUpgrade);

        assertFalse(keyChangeSucceeded);
        assertFalse(upgradeSucceeded);
        assertEq(account.publicKeyBlob(), keyBlob);
    }

    function test_reentrantExecutionIsBlocked() public {
        ReenteringTarget reenteringTarget = new ReenteringTarget();
        bytes memory data = abi.encodeCall(
            ReenteringTarget.attemptReentry,
            (address(account), address(target), block.timestamp + 1 hours)
        );
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _sign(
            keySeed,
            _message(block.chainid, address(account), 0, address(reenteringTarget), 0, data, deadline)
        );

        account.execute(address(reenteringTarget), 0, data, deadline, signature);

        assertTrue(reenteringTarget.reentryBlocked());
        assertEq(account.nonce(), 1);
        assertEq(target.calls(), 0);
    }

    function _message(
        uint256 chainId,
        address accountAddress,
        uint256 operationNonce,
        address callTarget,
        uint256 value,
        bytes memory callData,
        uint256 validUntil
    ) private pure returns (bytes memory) {
        return abi.encode(
            DOMAIN_TAG,
            chainId,
            accountAddress,
            operationNonce,
            callTarget,
            value,
            keccak256(callData),
            validUntil
        );
    }

    function _sign(string memory seed, bytes memory message) private returns (bytes memory signature) {
        string[] memory command = new string[](5);
        command[0] = PYTHON;
        command[1] = VECTOR_GENERATOR;
        command[2] = "seed";
        command[3] = seed;
        command[4] = vm.toString(message);

        bytes memory encoded = vm.ffi(command);
        bytes memory ignoredBlob;
        bytes memory echoedMessage;
        (signature, ignoredBlob, echoedMessage) = abi.decode(encoded, (bytes, bytes, bytes));
        assertEq(keccak256(echoedMessage), keccak256(message));
        assertEq(signature.length, 2_420);
    }

    function _deployBlob(string memory seed) private returns (address blobAddress) {
        bytes memory payload = _blobPayload(seed);
        assertEq(payload.length, 20_544);

        (blobAddress,) = _deployDataWithGas(bytes.concat(hex"00", payload));
    }

    function _blobPayload(string memory seed) private returns (bytes memory payload) {
        string[] memory command = new string[](4);
        command[0] = PYTHON;
        command[1] = KEY_BLOB_GENERATOR;
        command[2] = "seed";
        command[3] = seed;
        payload = vm.ffi(command);
        assertEq(payload.length, 20_544);
    }

    function _forgeZeroCacheSignature(bytes memory message) private view returns (bytes memory signature) {
        bytes memory muInput = new bytes(66 + message.length);
        for (uint256 i = 0; i < message.length; ++i) {
            muInput[66 + i] = message[i];
        }
        bytes memory mu = shake256Batch170(muInput, 64, helper);

        bytes memory finalInput = new bytes(832);
        for (uint256 i = 0; i < 64; ++i) {
            finalInput[i] = mu[i];
        }
        bytes32 challenge = bytes32(shake256Batch170(finalInput, 32, helper));
        signature = bytes.concat(challenge, _zeroZBytes(), new bytes(84));
        assertEq(signature.length, 2_420);
    }

    function _zeroZBytes() private pure returns (bytes memory encoded) {
        // FIPS sigDecode's packed field representation of z = 0 uses gamma1
        // (2^17) in each 18-bit field; the decoded centered coefficients are 0.
        encoded = new bytes(2_304);
        for (uint256 i = 0; i < encoded.length; i += 9) {
            encoded[i + 2] = 0x02;
            encoded[i + 4] = 0x08;
            encoded[i + 6] = 0x20;
            encoded[i + 8] = 0x80;
        }
    }

    function _deployDataWithGas(bytes memory runtime)
        private
        returns (address blobAddress, uint256 creationGas)
    {
        bytes memory initCode = abi.encodePacked(
            bytes1(0x61), uint16(runtime.length), hex"600e600039", bytes1(0x61), uint16(runtime.length), hex"6000f3", runtime
        );
        uint256 gasBefore = gasleft();
        assembly ("memory-safe") {
            blobAddress := create(0, add(initCode, 32), mload(initCode))
        }
        creationGas = gasBefore - gasleft();
        assertTrue(blobAddress != address(0));
    }
}
