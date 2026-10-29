// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice EIP-191 approval records for an exact inactive Robinhood Mainnet deployment batch.
/// @dev This verifies signatures and record integrity; it cannot prove that a reviewer is independent.
library MainnetDeploymentApproval {
    uint256 internal constant MAX_APPROVAL_TTL = 24 hours;
    uint256 private constant SECP256K1_HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes32 private constant REVIEW_TYPEHASH = keccak256(
        "VeyraMainnetIndependentReview(uint256 chainId,address deployer,address owner,address attestor,uint8 ownerProfile,uint64 startingDeployerNonce,bytes32 deploymentBatchHash,bytes32 reviewPackageSha256,bytes32 independentReviewReportSha256,address reviewer,bytes32 decision)"
    );
    bytes32 private constant OWNER_APPROVAL_TYPEHASH =
        keccak256("VeyraMainnetOwnerApproval(bytes32 deploymentAndReviewContextHash,bytes32 feeApprovalHash)");
    bytes32 private constant APPROVE_INACTIVE_DEPLOYMENT = keccak256("APPROVE_EOA_INACTIVE_DEPLOYMENT_ONLY");

    struct Record {
        uint256 chainId;
        address deployer;
        address owner;
        address attestor;
        address reviewer;
        uint8 ownerProfile;
        uint64 startingDeployerNonce;
        bytes32 deploymentBatchHash;
        bytes32 reviewPackageSha256;
        bytes32 independentReviewReportSha256;
        uint256 maxFeePerGasWei;
        uint256 maxTotalFeeWei;
        uint256 expiresAt;
    }

    error InvalidApprovalRecord();
    error InvalidReviewer();
    error InvalidApprovalWindow();
    error InvalidFeeApproval();
    error InvalidReviewerSignature();
    error InvalidOwnerSignature();
    error InvalidSignatureEncoding();
    error BroadcastGasPriceMismatch(uint256 observedGasPrice, uint256 approvedGasPrice);

    /// @notice The 32-byte message a wallet can pass to `personal_sign` for reviewer approval.
    /// @dev The wallet adds the EIP-191 prefix; this value is not itself the final digest.
    function reviewPersonalSignMessage(Record memory record) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                REVIEW_TYPEHASH,
                record.chainId,
                record.deployer,
                record.owner,
                record.attestor,
                record.ownerProfile,
                record.startingDeployerNonce,
                record.deploymentBatchHash,
                record.reviewPackageSha256,
                record.independentReviewReportSha256,
                record.reviewer,
                APPROVE_INACTIVE_DEPLOYMENT
            )
        );
    }

    function reviewDigest(Record memory record) internal pure returns (bytes32) {
        return _toPersonalSignDigest(reviewPersonalSignMessage(record));
    }

    /// @notice The 32-byte message a wallet can pass to `personal_sign` for owner approval.
    /// @dev The wallet adds the EIP-191 prefix; this value is not itself the final digest.
    function ownerPersonalSignMessage(Record memory record) internal pure returns (bytes32) {
        bytes32 deploymentAndReviewContextHash = keccak256(
            abi.encode(
                record.chainId,
                record.deployer,
                record.owner,
                record.attestor,
                record.ownerProfile,
                record.startingDeployerNonce,
                record.deploymentBatchHash,
                record.reviewPackageSha256,
                record.independentReviewReportSha256,
                record.reviewer,
                reviewDigest(record)
            )
        );
        bytes32 feeApprovalHash = keccak256(abi.encode(record.maxFeePerGasWei, record.maxTotalFeeWei, record.expiresAt));
        return keccak256(abi.encode(OWNER_APPROVAL_TYPEHASH, deploymentAndReviewContextHash, feeApprovalHash));
    }

    function ownerDigest(Record memory record) internal pure returns (bytes32) {
        return _toPersonalSignDigest(ownerPersonalSignMessage(record));
    }

    function verify(Record memory record, bytes memory reviewerSignature, bytes memory ownerSignature, uint256 now_)
        internal
        pure
    {
        if (
            record.chainId != 4_663 || record.ownerProfile != 1 || record.deployer == address(0)
                || record.owner == address(0) || record.attestor == address(0)
                || record.deploymentBatchHash == bytes32(0) || record.reviewPackageSha256 == bytes32(0)
                || record.independentReviewReportSha256 == bytes32(0) || record.owner == record.deployer
                || record.owner == record.attestor || record.deployer == record.attestor
        ) revert InvalidApprovalRecord();
        if (
            record.reviewer == address(0) || record.reviewer == record.deployer || record.reviewer == record.owner
                || record.reviewer == record.attestor
        ) revert InvalidReviewer();
        if (record.expiresAt <= now_ || record.expiresAt > now_ + MAX_APPROVAL_TTL) {
            revert InvalidApprovalWindow();
        }
        if (record.maxFeePerGasWei == 0 || record.maxTotalFeeWei == 0) revert InvalidFeeApproval();
        if (_recover(reviewDigest(record), reviewerSignature) != record.reviewer) revert InvalidReviewerSignature();
        if (_recover(ownerDigest(record), ownerSignature) != record.owner) revert InvalidOwnerSignature();
    }

    function verifyLegacyGasPrice(uint256 observedGasPrice, uint256 approvedGasPrice) internal pure {
        if (approvedGasPrice == 0 || observedGasPrice != approvedGasPrice) {
            revert BroadcastGasPriceMismatch(observedGasPrice, approvedGasPrice);
        }
    }

    function _toPersonalSignDigest(bytes32 structHash) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
    }

    function _recover(bytes32 digest, bytes memory signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignatureEncoding();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if ((v != 27 && v != 28) || uint256(s) == 0 || uint256(s) > SECP256K1_HALF_ORDER) {
            revert InvalidSignatureEncoding();
        }
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignatureEncoding();
    }
}
