// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title NammaSevaAccess
/// @notice Single source of roles, ward scoping and the global emergency pause for all Namma Seva
///         contracts. Replaces DecentraliTrack's `RoleManager`.
/// @dev `DEFAULT_ADMIN_ROLE` is ADMIN. On mainnet it is held by the multisig + timelock (ADR 0006).
///      Roles are global; `wardAccess` additionally scopes officials and auditors to the wards
///      (e.g. BBMP ward numbers) they may act in.
///      Member counts are tracked here instead of using `AccessControlEnumerable`: in OZ 5.6 that
///      pulls in `Arrays.sol`, which uses the Cancun-only MCOPY opcode MST mainnet lacks (ADR 0003).
contract NammaSevaAccess is AccessControl, Pausable {
    bytes32 public constant GOVT_OFFICIAL_ROLE = keccak256("GOVT_OFFICIAL");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR");
    bytes32 public constant CONTRACTOR_ROLE = keccak256("CONTRACTOR");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER");

    /// @notice Ward id meaning "every ward".
    uint32 public constant ALL_WARDS = type(uint32).max;

    mapping(address account => mapping(uint32 wardId => bool)) private _wardAccess;
    mapping(bytes32 role => uint256) private _roleMemberCount;

    event WardAccessSet(address indexed account, uint32 indexed wardId, bool allowed);

    error ZeroAddress();

    /// @param admin Initial ADMIN and PAUSER (deployer on testnet, timelock on mainnet).
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /// @notice Allow or disallow `account` to act in `wardId` (`ALL_WARDS` for every ward).
    function setWardAccess(address account, uint32 wardId, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setWardAccess(account, wardId, allowed);
    }

    /// @notice Batch version of {setWardAccess} for onboarding an official across several wards.
    function setWardAccessBatch(address account, uint32[] calldata wardIds, bool allowed)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < wardIds.length; ++i) {
            _setWardAccess(account, wardIds[i], allowed);
        }
    }

    /// @notice Whether `account` may act in `wardId`.
    function hasWardAccess(address account, uint32 wardId) public view returns (bool) {
        return _wardAccess[account][ALL_WARDS] || _wardAccess[account][wardId];
    }

    /// @notice Whether `account` holds `role` and may act in `wardId`.
    function hasRoleInWard(bytes32 role, address account, uint32 wardId) external view returns (bool) {
        return hasRole(role, account) && hasWardAccess(account, wardId);
    }

    /// @notice Emergency stop for every Namma Seva contract. PAUSER can pause; only ADMIN can resume.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resume after an emergency pause.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Number of accounts currently holding `role`.
    function getRoleMemberCount(bytes32 role) external view returns (uint256) {
        return _roleMemberCount[role];
    }

    function _grantRole(bytes32 role, address account) internal override returns (bool granted) {
        granted = super._grantRole(role, account);
        if (granted) ++_roleMemberCount[role];
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool revoked) {
        revoked = super._revokeRole(role, account);
        if (revoked) --_roleMemberCount[role];
    }

    function _setWardAccess(address account, uint32 wardId, bool allowed) private {
        if (account == address(0)) revert ZeroAddress();
        _wardAccess[account][wardId] = allowed;
        emit WardAccessSet(account, wardId, allowed);
    }
}
