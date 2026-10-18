// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev The interface exposed by the pinned Fireblocks ML-DSA-44 research
/// verifier. The verifier source is fetched at a fixed commit by the Phase 0
/// test script rather than copied into the application workspace.
interface IMLDSA44Verifier {
    function verify(address pkBlob, bytes calldata message, bytes calldata signature)
        external
        view
        returns (bool accepted);
}

/// @notice Phase 0 research harness, not a production smart account.
/// @dev Demonstrates the asset-execution boundary only. It does not validate
///      that the public-key blob was correctly derived from a genuine,
///      non-degenerate FIPS 204 key. Key registration, token policy, recovery,
///      ERC-4337 integration, and production deployment are intentionally out
///      of scope and remain blocking design work.
contract QevraAuthorizationHarness {
    bytes32 private constant DOMAIN_TAG = keccak256("QEVRA_MLDSA44_PHASE0_V1");
    uint256 private constant PREPARED_MLDSA44_BLOB_SIZE = 20_545;

    IMLDSA44Verifier public immutable verifier;
    address public immutable publicKeyBlob;
    bytes32 private immutable verifierCodeHash;
    bytes32 private immutable publicKeyBlobCodeHash;

    uint256 public nonce;
    bool private executing;

    error InvalidSetup();
    error ExpiredAuthorization();
    error InvalidSignature();
    error VerifierCodeChanged();
    error PublicKeyBlobChanged();
    error ReentrantExecution();
    error AuthorizedCallFailed(bytes returnData);

    event AuthorizedCallExecuted(
        uint256 indexed nonce,
        address indexed target,
        uint256 value,
        bytes32 callDataHash
    );

    constructor(address verifierAddress, address keyBlobAddress) {
        if (
            verifierAddress.code.length == 0 ||
            keyBlobAddress.code.length != PREPARED_MLDSA44_BLOB_SIZE
        ) revert InvalidSetup();

        verifier = IMLDSA44Verifier(verifierAddress);
        publicKeyBlob = keyBlobAddress;
        verifierCodeHash = verifierAddress.codehash;
        publicKeyBlobCodeHash = keyBlobAddress.codehash;
    }

    /// @notice Execute a call only when ML-DSA-44 authorizes its exact intent.
    /// @dev Anyone may relay a valid signature. No EOA, owner, recovery key,
    ///      upgrade role, or alternate transfer path is installed. The signed
    ///      message binds the chain, this account, nonce, target, value, calldata
    ///      hash, and deadline. Arbitrary CALL targets are permitted here only
    ///      to keep this experiment small; a real account requires a reviewed
    ///      deterministic target and method policy.
    function execute(
        address target,
        uint256 value,
        bytes calldata callData,
        uint256 validUntil,
        bytes calldata signature
    ) external returns (bytes memory returnData) {
        if (block.timestamp > validUntil) revert ExpiredAuthorization();
        if (address(verifier).codehash != verifierCodeHash) revert VerifierCodeChanged();
        if (publicKeyBlob.codehash != publicKeyBlobCodeHash) revert PublicKeyBlobChanged();
        if (executing) revert ReentrantExecution();

        bytes memory message = abi.encode(
            DOMAIN_TAG,
            block.chainid,
            address(this),
            nonce,
            target,
            value,
            keccak256(callData),
            validUntil
        );

        if (!verifier.verify(publicKeyBlob, message, signature)) revert InvalidSignature();

        uint256 usedNonce = nonce;
        nonce = usedNonce + 1;
        executing = true;

        (bool success, bytes memory result) = target.call{value: value}(callData);
        executing = false;
        if (!success) revert AuthorizedCallFailed(result);

        emit AuthorizedCallExecuted(usedNonce, target, value, keccak256(callData));
        return result;
    }

    receive() external payable {}
}
