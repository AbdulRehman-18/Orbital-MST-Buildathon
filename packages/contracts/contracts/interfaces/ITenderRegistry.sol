// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ITenderRegistry {
    /// @notice Whether `projectId` has a tender that is still OPEN.
    function hasOpenTender(uint256 projectId) external view returns (bool);
}
