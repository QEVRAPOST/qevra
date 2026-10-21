// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Small, self-contained owner-managed role primitive used by VEYRA registries.
/// @dev Ownership controls configuration, never end-user asset authorization.
abstract contract VeyraAccessManaged {
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    address public owner;
    mapping(bytes32 role => mapping(address account => bool)) private _roles;

    error Unauthorized(address caller);
    error ZeroAddress();
    error RoleAlreadyGranted(bytes32 role, address account);
    error RoleNotGranted(bytes32 role, address account);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    constructor() {
        owner = msg.sender;
        _roles[DEFAULT_ADMIN_ROLE][msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RoleGranted(DEFAULT_ADMIN_ROLE, msg.sender, msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert Unauthorized(msg.sender);
        _;
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }

    function grantRole(bytes32 role, address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (_roles[role][account]) revert RoleAlreadyGranted(role, account);
        _roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }

    function revokeRole(bytes32 role, address account) external onlyOwner {
        if (!_roles[role][account]) revert RoleNotGranted(role, account);
        _roles[role][account] = false;
        emit RoleRevoked(role, account, msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address previousOwner = owner;
        owner = newOwner;
        _roles[DEFAULT_ADMIN_ROLE][previousOwner] = false;
        _roles[DEFAULT_ADMIN_ROLE][newOwner] = true;
        emit RoleRevoked(DEFAULT_ADMIN_ROLE, previousOwner, msg.sender);
        emit RoleGranted(DEFAULT_ADMIN_ROLE, newOwner, msg.sender);
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function _grantRole(bytes32 role, address account) internal {
        if (account == address(0)) revert ZeroAddress();
        if (_roles[role][account]) revert RoleAlreadyGranted(role, account);
        _roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }
}
