// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {NammaSevaBase} from "./NammaSevaBase.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {IMilestoneEscrow} from "./interfaces/IMilestoneEscrow.sol";
import {ITenderRegistry} from "./interfaces/ITenderRegistry.sol";

/// @title ProjectRegistry
/// @notice Lifecycle of public infrastructure projects: creation by an official, M-of-N auditor
///         approval, pause/resume, cancellation and closure. Titles, descriptions and photos live
///         off-chain; the chain stores their IPFS CID and keccak256 hash (plan §7.3, fix M-3).
/// @dev Fixes vs DecentraliTrack: C-1 (mutators restricted to the escrow), M-1 (close only when
///      every milestone is settled), H-4 (per-project approval threshold).
contract ProjectRegistry is NammaSevaBase, IProjectRegistry {
    /// @notice Upper bound on M for M-of-N approvals (keeps approval bookkeeping bounded, M-2).
    uint8 public constant MAX_APPROVAL_THRESHOLD = 7;

    struct NewProject {
        bytes32 metaHash;
        string metaCID;
        uint32 wardId;
        uint16 departmentId;
        Category category;
        int32 latE6;
        int32 lngE6;
        uint128 budget;
        uint64 startDate;
        uint64 endDate;
        address contractor; // zero when the contractor will come from a tender
        uint8 approvalThreshold;
    }

    address public escrow;
    address public tenderRegistry;
    address public grievanceRegistry;

    uint64 public projectCount;
    mapping(uint256 projectId => Project) private _projects;
    mapping(uint256 projectId => mapping(address auditor => bool)) public hasApprovedProject;

    event LinkedContractSet(bytes32 indexed kind, address indexed target);
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed official,
        uint32 indexed wardId,
        bytes32 metaHash,
        string metaCID,
        Category category,
        uint16 departmentId,
        int32 latE6,
        int32 lngE6,
        uint128 budget,
        uint64 startDate,
        uint64 endDate,
        address contractor,
        uint8 approvalThreshold
    );
    event ProjectApproved(uint256 indexed projectId, address indexed auditor, uint8 approvalCount);
    event ProjectRejected(uint256 indexed projectId, address indexed auditor, bytes32 reasonHash);
    event ProjectPaused(uint256 indexed projectId, address indexed actor, bytes32 reasonHash, uint256 grievanceId);
    event ProjectResumed(uint256 indexed projectId, address indexed auditor);
    event ProjectCancelRequested(uint256 indexed projectId, address indexed official, bytes32 reasonHash);
    event ProjectCancelled(uint256 indexed projectId, address indexed auditor);
    event ProjectClosed(uint256 indexed projectId, address indexed official);
    event ProjectStatusChanged(uint256 indexed projectId, Status status);
    event ContractorAssigned(uint256 indexed projectId, address indexed contractor, address indexed assignedBy);
    event MilestoneCountUpdated(uint256 indexed projectId, uint16 milestoneCount);
    event SpentUpdated(uint256 indexed projectId, uint128 spent);

    error OnlyEscrow();
    error OnlyGrievanceRegistry();
    error ProjectNotFound(uint256 projectId);
    error InvalidStatus(uint256 projectId, Status status);
    error InvalidMetadata();
    error InvalidBudget();
    error InvalidDates();
    error InvalidCoordinates();
    error InvalidThreshold(uint8 threshold, uint256 auditorCount);
    error NotAContractor(address account);
    error AlreadyApproved(uint256 projectId, address auditor);
    error SelfApproval();
    error NotProjectOfficial(uint256 projectId, address account);
    error CancelNotRequested(uint256 projectId);
    error MilestonesUnsettled(uint256 projectId, uint256 count);
    error NoMilestones(uint256 projectId);
    error ContractorAlreadyAssigned(uint256 projectId);
    error TenderInProgress(uint256 projectId);
    error BudgetExceeded(uint256 projectId);

    modifier onlyEscrow() {
        if (_msgSender() != escrow) revert OnlyEscrow();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param access_ Address of {NammaSevaAccess}.
    function initialize(address access_) external initializer {
        __NammaSevaBase_init(access_);
    }

    // ─── Wiring (ADMIN, set once) ────────────────────────────────────────────

    /// @notice Set the {MilestoneEscrow} allowed to update milestone counts and spend. Once only.
    // slither-disable-next-line missing-zero-check (checked in _setOnce)
    function setEscrow(address escrow_) external onlyRole(ADMIN_ROLE) {
        escrow = _setOnce(escrow, escrow_, "ESCROW");
    }

    /// @notice Set the {TenderRegistry} allowed to assign awarded contractors. Once only.
    // slither-disable-next-line missing-zero-check (checked in _setOnce)
    function setTenderRegistry(address tender_) external onlyRole(ADMIN_ROLE) {
        tenderRegistry = _setOnce(tenderRegistry, tender_, "TENDER");
    }

    /// @notice Set the {GrievanceRegistry} allowed to pause projects. Once only.
    // slither-disable-next-line missing-zero-check (checked in _setOnce)
    function setGrievanceRegistry(address grievance_) external onlyRole(ADMIN_ROLE) {
        grievanceRegistry = _setOnce(grievanceRegistry, grievance_, "GRIEVANCE");
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    /// @notice Register a new project in PENDING_APPROVAL. Caller must be an official of `p.wardId`.
    /// @return projectId The new project id (starts at 1).
    function createProject(NewProject calldata p) external whenNotPaused returns (uint256 projectId) {
        address sender = _msgSender();
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, sender, p.wardId);

        if (p.metaHash == bytes32(0) || bytes(p.metaCID).length == 0) revert InvalidMetadata();
        if (p.budget == 0) revert InvalidBudget();
        if (p.endDate <= p.startDate || p.endDate <= block.timestamp) revert InvalidDates();
        if (p.latE6 < -90_000_000 || p.latE6 > 90_000_000 || p.lngE6 < -180_000_000 || p.lngE6 > 180_000_000) {
            revert InvalidCoordinates();
        }
        uint256 auditors = access.getRoleMemberCount(AUDITOR_ROLE);
        if (p.approvalThreshold == 0 || p.approvalThreshold > MAX_APPROVAL_THRESHOLD || p.approvalThreshold > auditors) {
            revert InvalidThreshold(p.approvalThreshold, auditors);
        }
        if (p.contractor != address(0)) _checkContractor(p.contractor);

        projectId = ++projectCount;
        Project storage s = _projects[projectId];
        s.id = uint64(projectId);
        s.metaHash = p.metaHash; // the CID itself is only emitted (ADR 0008)
        s.wardId = p.wardId;
        s.departmentId = p.departmentId;
        s.category = p.category;
        s.latE6 = p.latE6;
        s.lngE6 = p.lngE6;
        s.budget = p.budget;
        s.startDate = p.startDate;
        s.endDate = p.endDate;
        s.official = sender;
        s.contractor = p.contractor;
        s.approvalThreshold = p.approvalThreshold;
        // status defaults to PENDING_APPROVAL

        emit ProjectCreated(
            projectId,
            sender,
            p.wardId,
            p.metaHash,
            p.metaCID,
            p.category,
            p.departmentId,
            p.latE6,
            p.lngE6,
            p.budget,
            p.startDate,
            p.endDate,
            p.contractor,
            p.approvalThreshold
        );
    }

    /// @notice Auditor approval. The project becomes ACTIVE once `approvalThreshold` distinct
    ///         auditors of its ward have approved.
    function approveProject(uint256 projectId) external whenNotPaused {
        Project storage s = _existing(projectId);
        address sender = _msgSender();
        _checkRoleInWard(AUDITOR_ROLE, sender, s.wardId);
        _requireStatus(s, Status.PENDING_APPROVAL);
        if (sender == s.official) revert SelfApproval();
        if (hasApprovedProject[projectId][sender]) revert AlreadyApproved(projectId, sender);

        hasApprovedProject[projectId][sender] = true;
        uint8 count = ++s.approvalCount;
        emit ProjectApproved(projectId, sender, count);

        if (count >= s.approvalThreshold) _setStatus(s, Status.ACTIVE);
    }

    /// @notice Auditor rejects a pending project → CANCELLED.
    /// @param reasonHash keccak256 of the reason text (text itself is off-chain).
    function rejectProject(uint256 projectId, bytes32 reasonHash) external whenNotPaused {
        Project storage s = _existing(projectId);
        _checkRoleInWard(AUDITOR_ROLE, _msgSender(), s.wardId);
        _requireStatus(s, Status.PENDING_APPROVAL);
        emit ProjectRejected(projectId, _msgSender(), reasonHash);
        _setStatus(s, Status.CANCELLED);
    }

    /// @notice Auditor pauses an ACTIVE project; no proofs, approvals or releases while PAUSED (H-2).
    function pauseProject(uint256 projectId, bytes32 reasonHash) external whenNotPaused {
        Project storage s = _existing(projectId);
        _checkRoleInWard(AUDITOR_ROLE, _msgSender(), s.wardId);
        _requireStatus(s, Status.ACTIVE);
        emit ProjectPaused(projectId, _msgSender(), reasonHash, 0);
        _setStatus(s, Status.PAUSED);
    }

    /// @notice Pause triggered by an auditor's response to an escalated grievance.
    function pauseByGrievance(uint256 projectId, uint256 grievanceId) external whenNotPaused {
        if (_msgSender() != grievanceRegistry) revert OnlyGrievanceRegistry();
        Project storage s = _existing(projectId);
        _requireStatus(s, Status.ACTIVE);
        emit ProjectPaused(projectId, _msgSender(), bytes32(0), grievanceId);
        _setStatus(s, Status.PAUSED);
    }

    /// @notice Auditor resumes a PAUSED project.
    function resumeProject(uint256 projectId) external whenNotPaused {
        Project storage s = _existing(projectId);
        _checkRoleInWard(AUDITOR_ROLE, _msgSender(), s.wardId);
        _requireStatus(s, Status.PAUSED);
        emit ProjectResumed(projectId, _msgSender());
        _setStatus(s, Status.ACTIVE);
    }

    /// @notice The project's official asks to cancel; an auditor must confirm (two-party, plan §7.2).
    function requestCancel(uint256 projectId, bytes32 reasonHash) external whenNotPaused {
        Project storage s = _existing(projectId);
        address sender = _msgSender();
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, sender, s.wardId);
        if (sender != s.official) revert NotProjectOfficial(projectId, sender);
        if (s.status != Status.ACTIVE && s.status != Status.PAUSED) revert InvalidStatus(projectId, s.status);
        s.cancelRequested = true;
        emit ProjectCancelRequested(projectId, sender, reasonHash);
    }

    /// @notice Auditor confirms a cancellation requested by the official → CANCELLED.
    function confirmCancel(uint256 projectId) external whenNotPaused {
        Project storage s = _existing(projectId);
        _checkRoleInWard(AUDITOR_ROLE, _msgSender(), s.wardId);
        if (!s.cancelRequested) revert CancelNotRequested(projectId);
        if (s.status != Status.ACTIVE && s.status != Status.PAUSED) revert InvalidStatus(projectId, s.status);
        emit ProjectCancelled(projectId, _msgSender());
        _setStatus(s, Status.CANCELLED);
    }

    /// @notice Official closes an ACTIVE project once every milestone is PAID or VOID (M-1).
    function closeProject(uint256 projectId) external whenNotPaused {
        Project storage s = _existing(projectId);
        address sender = _msgSender();
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, sender, s.wardId);
        _requireStatus(s, Status.ACTIVE);
        if (s.milestoneCount == 0) revert NoMilestones(projectId);
        uint256 open = IMilestoneEscrow(escrow).unsettledMilestones(projectId);
        if (open != 0) revert MilestonesUnsettled(projectId, open);
        emit ProjectClosed(projectId, sender);
        _setStatus(s, Status.COMPLETED);
    }

    /// @notice Assign the contractor of a project that has none yet. Called by the
    ///         {TenderRegistry} on award, or directly by a ward official when no tender is open.
    function assignContractor(uint256 projectId, address contractor) external whenNotPaused {
        Project storage s = _existing(projectId);
        address sender = _msgSender();
        if (sender != tenderRegistry) {
            _checkRoleInWard(GOVT_OFFICIAL_ROLE, sender, s.wardId);
            if (tenderRegistry != address(0) && ITenderRegistry(tenderRegistry).hasOpenTender(projectId)) {
                revert TenderInProgress(projectId);
            }
        }
        if (s.status != Status.PENDING_APPROVAL && s.status != Status.ACTIVE) revert InvalidStatus(projectId, s.status);
        if (s.contractor != address(0)) revert ContractorAlreadyAssigned(projectId);
        _checkContractor(contractor);
        s.contractor = contractor;
        emit ContractorAssigned(projectId, contractor, sender);
    }

    // ─── Escrow hooks (C-1) ──────────────────────────────────────────────────

    /// @inheritdoc IProjectRegistry
    function recordMilestoneCreated(uint256 projectId) external onlyEscrow {
        Project storage s = _existing(projectId);
        uint16 count = ++s.milestoneCount;
        emit MilestoneCountUpdated(projectId, count);
    }

    /// @inheritdoc IProjectRegistry
    function recordSpent(uint256 projectId, uint256 amount) external onlyEscrow {
        Project storage s = _existing(projectId);
        uint256 spent = uint256(s.spent) + amount;
        if (spent > s.budget) revert BudgetExceeded(projectId);
        s.spent = uint128(spent);
        emit SpentUpdated(projectId, uint128(spent));
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    /// @inheritdoc IProjectRegistry
    function getProject(uint256 projectId) external view returns (Project memory) {
        return _existing(projectId);
    }

    /// @notice Whether `projectId` exists.
    function exists(uint256 projectId) external view returns (bool) {
        return projectId != 0 && projectId <= projectCount;
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _existing(uint256 projectId) private view returns (Project storage s) {
        if (projectId == 0 || projectId > projectCount) revert ProjectNotFound(projectId);
        s = _projects[projectId];
    }

    function _requireStatus(Project storage s, Status expected) private view {
        if (s.status != expected) revert InvalidStatus(s.id, s.status);
    }

    function _setStatus(Project storage s, Status status) private {
        s.status = status;
        emit ProjectStatusChanged(s.id, status);
    }

    function _checkContractor(address account) private view {
        if (!access.hasRole(CONTRACTOR_ROLE, account)) revert NotAContractor(account);
    }

    function _setOnce(address current, address next, bytes32 kind) private returns (address) {
        if (current != address(0)) revert AlreadySet();
        if (next == address(0)) revert ZeroAddress();
        emit LinkedContractSet(kind, next);
        return next;
    }
}
