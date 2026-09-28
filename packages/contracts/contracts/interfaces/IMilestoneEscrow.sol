// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IMilestoneEscrow {
    /// @notice Milestones of `projectId` that are neither PAID nor VOID.
    function unsettledMilestones(uint256 projectId) external view returns (uint256);
}
