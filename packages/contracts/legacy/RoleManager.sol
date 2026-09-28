// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract RoleManager is AccessControl {
    bytes32 public constant ADMIN = keccak256("ADMIN");
    bytes32 public constant GOVT_OFFICIAL = keccak256("GOVT_OFFICIAL");
    bytes32 public constant CONTRACTOR = keccak256("CONTRACTOR");
    bytes32 public constant AUDITOR = keccak256("AUDITOR");
    bytes32 public constant CITIZEN = keccak256("CITIZEN");

    mapping(address => bytes32) private primaryRoles;

    event RoleGrantedToUser(address indexed user, bytes32 indexed role);
    event RoleRevokedFromUser(address indexed user, bytes32 indexed role);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN, msg.sender);
        primaryRoles[msg.sender] = ADMIN;
    }

    function grantUserRole(address account, bytes32 role) external onlyRole(ADMIN) {
        _grantRole(role, account);
        primaryRoles[account] = role;
        emit RoleGrantedToUser(account, role);
    }

    function revokeUserRole(address account, bytes32 role) external onlyRole(ADMIN) {
        _revokeRole(role, account);
        if (primaryRoles[account] == role) {
            primaryRoles[account] = bytes32(0);
        }
        emit RoleRevokedFromUser(account, role);
    }

    function hasUserRole(address account, bytes32 role) external view returns (bool) {
        return hasRole(role, account);
    }

    function getUserRole(address account) external view returns (bytes32) {
        return primaryRoles[account];
    }
}
