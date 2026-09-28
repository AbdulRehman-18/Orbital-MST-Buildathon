// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {NammaSevaAccess} from "./NammaSevaAccess.sol";

/// @title NammaSevaBase
/// @notice Shared plumbing for the upgradeable Namma Seva contracts: access lookups, the global
///         pause and UUPS upgrade authorisation (ADMIN only — multisig + timelock on mainnet).
abstract contract NammaSevaBase is Initializable, ContextUpgradeable, UUPSUpgradeable {
    // Same values as NammaSevaAccess; kept local to avoid an external call per role check.
    bytes32 internal constant ADMIN_ROLE = 0x00; // DEFAULT_ADMIN_ROLE
    bytes32 internal constant GOVT_OFFICIAL_ROLE = keccak256("GOVT_OFFICIAL");
    bytes32 internal constant AUDITOR_ROLE = keccak256("AUDITOR");
    bytes32 internal constant CONTRACTOR_ROLE = keccak256("CONTRACTOR");
    bytes32 internal constant RELAYER_ROLE = keccak256("RELAYER");

    NammaSevaAccess public access;

    /// @dev Reserved for future base-contract state.
    uint256[49] private __gap;

    error ZeroAddress();
    error Unauthorized(address account, bytes32 role);
    error NotInWard(address account, uint32 wardId);
    error SystemPaused();
    error AlreadySet();

    modifier onlyRole(bytes32 role) {
        _checkRole(role, _msgSender());
        _;
    }

    modifier whenNotPaused() {
        if (access.paused()) revert SystemPaused();
        _;
    }

    // solhint-disable-next-line func-name-mixedcase
    function __NammaSevaBase_init(address access_) internal onlyInitializing {
        if (access_ == address(0)) revert ZeroAddress();
        access = NammaSevaAccess(access_);
    }

    function _checkRole(bytes32 role, address account) internal view {
        if (!access.hasRole(role, account)) revert Unauthorized(account, role);
    }

    function _checkRoleInWard(bytes32 role, address account, uint32 wardId) internal view {
        _checkRole(role, account);
        if (!access.hasWardAccess(account, wardId)) revert NotInWard(account, wardId);
    }

    function _authorizeUpgrade(address) internal view override {
        _checkRole(ADMIN_ROLE, _msgSender());
    }
}
