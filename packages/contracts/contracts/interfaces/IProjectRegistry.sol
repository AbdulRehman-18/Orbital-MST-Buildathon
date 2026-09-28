// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Types and the cross-contract surface of {ProjectRegistry}.
interface IProjectRegistry {
    enum Status {
        PENDING_APPROVAL,
        ACTIVE,
        PAUSED,
        COMPLETED,
        CANCELLED
    }

    enum Category {
        ROAD,
        DRAINAGE,
        WATER_SUPPLY,
        STREET_LIGHTING,
        PARK,
        BUILDING,
        OTHER
    }

    /// @dev Packed into 5 slots. Amounts are in the escrow's accounting unit: INR paise in ledger
    ///      mode, wei of MSTC in escrow mode (plan §7.4). The metadata CID is emitted in
    ///      `ProjectCreated` only; storage keeps its keccak256 `metaHash` (ADR 0008).
    struct Project {
        bytes32 metaHash; // keccak256 of the canonical metadata JSON pinned at `metaCID`
        uint128 budget;
        uint128 spent;
        uint64 id;
        uint64 startDate;
        uint64 endDate;
        uint32 wardId;
        uint16 departmentId;
        int32 latE6; // micro-degrees
        int32 lngE6;
        address official;
        address contractor;
        Status status;
        Category category;
        uint8 approvalThreshold; // M in M-of-N auditor approval, for the project and its milestones
        uint8 approvalCount;
        uint16 milestoneCount;
        bool cancelRequested;
    }

    function getProject(uint256 projectId) external view returns (Project memory);

    function recordMilestoneCreated(uint256 projectId) external;

    function recordSpent(uint256 projectId, uint256 amount) external;

    function pauseByGrievance(uint256 projectId, uint256 grievanceId) external;

    function assignContractor(uint256 projectId, address contractor) external;
}
