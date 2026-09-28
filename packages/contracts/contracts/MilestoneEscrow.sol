// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {NammaSevaBase} from "./NammaSevaBase.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {IMilestoneEscrow} from "./interfaces/IMilestoneEscrow.sol";

/// @title MilestoneEscrow
/// @notice Sanction/escrow accounting and the milestone lifecycle: creation, contractor proof,
///         M-of-N auditor approval, release, voiding and refunds.
/// @dev Two funding modes share one interface and one set of events (plan §7.4):
///      - LEDGER (production): amounts are INR paise; `recordSanction` / `releaseFunds` log the
///        PFMS/UTR reference hash. No value moves on-chain.
///      - ESCROW (demo / pilot): native MSTC is locked here and paid to the contractor on release.
///      Fixes vs DecentraliTrack: C-2 (only the assigned contractor submits proof), H-1 (fund only
///      ACTIVE projects, refund path), H-2 (no approvals/releases unless ACTIVE), H-3 (cumulative
///      allocation ≤ balance), H-4 (M-of-N), M-2 (approval rounds instead of an unbounded reset loop).
contract MilestoneEscrow is NammaSevaBase, ReentrancyGuardUpgradeable, IMilestoneEscrow {
    enum Mode {
        LEDGER,
        ESCROW
    }

    enum MilestoneStatus {
        PENDING,
        PROOF_SUBMITTED,
        APPROVED,
        REJECTED,
        PAID,
        VOID
    }

    /// @dev 4 slots. CIDs of the metadata and proof live in `MilestoneCreated` / `ProofSubmitted`
    ///      events; storage keeps their keccak256 content hashes (ADR 0008).
    struct Milestone {
        bytes32 metaHash;
        bytes32 proofHash; // keccak256 of the canonical proof.json
        uint128 amount;
        uint64 id;
        uint64 projectId;
        int32 proofLatE6;
        int32 proofLngE6;
        uint64 submittedAt;
        uint32 round; // bumps on every rejection; approvals are per round (M-2)
        uint8 approvalCount;
        MilestoneStatus status;
    }

    struct ProjectFunds {
        uint128 funded; // total ever sanctioned / deposited
        uint128 balance; // funded − released − refunded
        uint128 allocated; // committed to PENDING…APPROVED milestones
        uint64 unsettled; // milestones not yet PAID or VOID
    }

    IProjectRegistry public registry;
    Mode public mode;
    /// @notice Receives refunds of unallocated escrow (ESCROW mode) — the funding department's account.
    address public treasury;

    uint64 public milestoneCount;
    mapping(uint256 milestoneId => Milestone) private _milestones;
    mapping(uint256 projectId => ProjectFunds) public funds;
    mapping(uint256 milestoneId => mapping(uint32 round => mapping(address auditor => bool))) private _approved;

    event ProjectFunded(
        uint256 indexed projectId, address indexed official, uint256 amount, bytes32 sanctionRefHash, uint256 balance
    );
    event MilestoneCreated(
        uint256 indexed milestoneId, uint256 indexed projectId, bytes32 metaHash, string metaCID, uint256 amount
    );
    event ProofSubmitted(
        uint256 indexed milestoneId,
        uint256 indexed projectId,
        address indexed contractor,
        string proofCID,
        bytes32 proofHash,
        int32 latE6,
        int32 lngE6,
        uint32 round
    );
    event MilestoneApproved(
        uint256 indexed milestoneId, uint256 indexed projectId, address indexed auditor, uint8 approvalCount, uint32 round
    );
    event MilestoneRejected(
        uint256 indexed milestoneId, uint256 indexed projectId, address indexed auditor, bytes32 reasonHash, uint32 round
    );
    event MilestoneStatusChanged(uint256 indexed milestoneId, uint256 indexed projectId, MilestoneStatus status);
    event FundsReleased(
        uint256 indexed milestoneId,
        uint256 indexed projectId,
        address indexed contractor,
        uint256 amount,
        bytes32 paymentRefHash
    );
    event MilestoneVoided(uint256 indexed milestoneId, uint256 indexed projectId, bytes32 reasonHash);
    event UnallocatedRefunded(uint256 indexed projectId, address indexed to, uint256 amount);

    error WrongMode(Mode required);
    error MilestoneNotFound(uint256 milestoneId);
    error InvalidMilestoneStatus(uint256 milestoneId, MilestoneStatus status);
    error ProjectNotActive(uint256 projectId, IProjectRegistry.Status status);
    error InvalidProjectStatus(uint256 projectId, IProjectRegistry.Status status);
    error ZeroAmount();
    error MissingReference();
    error InvalidMetadata();
    error InvalidCoordinates();
    error FundingExceedsBudget(uint256 projectId, uint256 requested, uint256 remaining);
    error InsufficientEscrow(uint256 projectId, uint256 requested, uint256 available);
    error NotAssignedContractor(uint256 projectId, address account);
    error AlreadyApproved(uint256 milestoneId, address auditor);
    error ConflictOfInterest(address account);
    error NothingToRefund(uint256 projectId);
    error TransferFailed(address to, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param access_ {NammaSevaAccess}
    /// @param registry_ {ProjectRegistry}
    /// @param mode_ LEDGER (0) or ESCROW (1); fixed for the life of the proxy
    /// @param treasury_ refund recipient for ESCROW mode
    function initialize(address access_, address registry_, Mode mode_, address treasury_) external initializer {
        __NammaSevaBase_init(access_);
        __ReentrancyGuard_init();
        if (registry_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        registry = IProjectRegistry(registry_);
        mode = mode_;
        treasury = treasury_;
    }

    // ─── Funding ─────────────────────────────────────────────────────────────

    /// @notice ESCROW mode: lock native MSTC for an ACTIVE project (H-1).
    function fundProject(uint256 projectId) external payable whenNotPaused {
        if (mode != Mode.ESCROW) revert WrongMode(Mode.ESCROW);
        _fund(projectId, msg.value, bytes32(0));
    }

    /// @notice LEDGER mode: record a sanction (in paise) with the hash of its PFMS reference.
    function recordSanction(uint256 projectId, uint256 amount, bytes32 sanctionRefHash) external whenNotPaused {
        if (mode != Mode.LEDGER) revert WrongMode(Mode.LEDGER);
        if (sanctionRefHash == bytes32(0)) revert MissingReference();
        _fund(projectId, amount, sanctionRefHash);
    }

    // ─── Milestones ──────────────────────────────────────────────────────────

    /// @notice Official commits part of the project's balance to a new milestone (H-3).
    function createMilestone(uint256 projectId, bytes32 metaHash, string calldata metaCID, uint256 amount)
        external
        whenNotPaused
        returns (uint256 milestoneId)
    {
        IProjectRegistry.Project memory p = registry.getProject(projectId);
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, _msgSender(), p.wardId);
        _requireActive(p);
        if (metaHash == bytes32(0) || bytes(metaCID).length == 0) revert InvalidMetadata();
        if (amount == 0) revert ZeroAmount();

        ProjectFunds storage f = funds[projectId];
        uint256 available = uint256(f.balance) - f.allocated;
        if (amount > available) revert InsufficientEscrow(projectId, amount, available);
        f.allocated += uint128(amount);
        f.unsettled += 1;

        milestoneId = ++milestoneCount;
        Milestone storage m = _milestones[milestoneId];
        m.id = uint64(milestoneId);
        m.projectId = uint64(projectId);
        m.metaHash = metaHash;
        m.amount = uint128(amount);

        emit MilestoneCreated(milestoneId, projectId, metaHash, metaCID, amount);
        registry.recordMilestoneCreated(projectId);
    }

    /// @notice The project's assigned contractor submits (or resubmits) proof of work (C-2).
    /// @param proofCID IPFS CID of proof.json (photos, EXIF checks)
    /// @param proofHash keccak256 of the canonical proof.json
    function submitProof(uint256 milestoneId, string calldata proofCID, bytes32 proofHash, int32 latE6, int32 lngE6)
        external
        whenNotPaused
    {
        Milestone storage m = _existing(milestoneId);
        IProjectRegistry.Project memory p = registry.getProject(m.projectId);
        _requireActive(p);
        address sender = _msgSender();
        if (sender != p.contractor) revert NotAssignedContractor(m.projectId, sender);
        _checkRole(CONTRACTOR_ROLE, sender);
        if (m.status != MilestoneStatus.PENDING && m.status != MilestoneStatus.REJECTED) {
            revert InvalidMilestoneStatus(milestoneId, m.status);
        }
        if (bytes(proofCID).length == 0 || proofHash == bytes32(0)) revert InvalidMetadata();
        if (latE6 < -90_000_000 || latE6 > 90_000_000 || lngE6 < -180_000_000 || lngE6 > 180_000_000) {
            revert InvalidCoordinates();
        }

        m.proofHash = proofHash;
        m.proofLatE6 = latE6;
        m.proofLngE6 = lngE6;
        m.submittedAt = uint64(block.timestamp);
        emit ProofSubmitted(milestoneId, m.projectId, sender, proofCID, proofHash, latE6, lngE6, m.round);
        _setStatus(m, MilestoneStatus.PROOF_SUBMITTED);
    }

    /// @notice Auditor approval of submitted proof. APPROVED once the project's threshold of
    ///         distinct auditors approve in the current round (H-4).
    function approveMilestone(uint256 milestoneId) external whenNotPaused {
        Milestone storage m = _existing(milestoneId);
        IProjectRegistry.Project memory p = registry.getProject(m.projectId);
        address sender = _msgSender();
        _checkRoleInWard(AUDITOR_ROLE, sender, p.wardId);
        _requireActive(p);
        if (m.status != MilestoneStatus.PROOF_SUBMITTED) revert InvalidMilestoneStatus(milestoneId, m.status);
        if (sender == p.contractor || sender == p.official) revert ConflictOfInterest(sender);
        if (_approved[milestoneId][m.round][sender]) revert AlreadyApproved(milestoneId, sender);

        _approved[milestoneId][m.round][sender] = true;
        uint8 count = ++m.approvalCount;
        emit MilestoneApproved(milestoneId, m.projectId, sender, count, m.round);

        if (count >= p.approvalThreshold) _setStatus(m, MilestoneStatus.APPROVED);
    }

    /// @notice Auditor rejects proof; the contractor may resubmit. Starts a new approval round,
    ///         so earlier approvals no longer count — O(1), no loop over approvers (M-2).
    function rejectMilestone(uint256 milestoneId, bytes32 reasonHash) external whenNotPaused {
        Milestone storage m = _existing(milestoneId);
        IProjectRegistry.Project memory p = registry.getProject(m.projectId);
        _checkRoleInWard(AUDITOR_ROLE, _msgSender(), p.wardId);
        if (p.status != IProjectRegistry.Status.ACTIVE && p.status != IProjectRegistry.Status.PAUSED) {
            revert InvalidProjectStatus(m.projectId, p.status);
        }
        if (m.status != MilestoneStatus.PROOF_SUBMITTED && m.status != MilestoneStatus.APPROVED) {
            revert InvalidMilestoneStatus(milestoneId, m.status);
        }

        emit MilestoneRejected(milestoneId, m.projectId, _msgSender(), reasonHash, m.round);
        m.round += 1;
        m.approvalCount = 0;
        _setStatus(m, MilestoneStatus.REJECTED);
    }

    /// @notice Official releases an APPROVED milestone to the contractor (H-2: project ACTIVE).
    /// @param paymentRefHash LEDGER: hash of the bank UTR / PFMS payment reference (required).
    ///        ESCROW: optional, pass zero.
    function releaseFunds(uint256 milestoneId, bytes32 paymentRefHash) external nonReentrant whenNotPaused {
        Milestone storage m = _existing(milestoneId);
        uint256 projectId = m.projectId;
        IProjectRegistry.Project memory p = registry.getProject(projectId);
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, _msgSender(), p.wardId);
        _requireActive(p);
        if (m.status != MilestoneStatus.APPROVED) revert InvalidMilestoneStatus(milestoneId, m.status);
        if (mode == Mode.LEDGER && paymentRefHash == bytes32(0)) revert MissingReference();

        uint128 amount = m.amount;
        ProjectFunds storage f = funds[projectId];
        f.balance -= amount;
        f.allocated -= amount;
        f.unsettled -= 1;
        _setStatus(m, MilestoneStatus.PAID);
        registry.recordSpent(projectId, amount);
        emit FundsReleased(milestoneId, projectId, p.contractor, amount, paymentRefHash);

        if (mode == Mode.ESCROW) _send(p.contractor, amount);
    }

    /// @notice Official voids a milestone and frees its allocation. Allowed for PENDING/REJECTED
    ///         milestones, or for any unsettled milestone once the project is CANCELLED.
    function cancelMilestone(uint256 milestoneId, bytes32 reasonHash) external whenNotPaused {
        Milestone storage m = _existing(milestoneId);
        IProjectRegistry.Project memory p = registry.getProject(m.projectId);
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, _msgSender(), p.wardId);

        bool cancellable = m.status == MilestoneStatus.PENDING || m.status == MilestoneStatus.REJECTED
            || (
                p.status == IProjectRegistry.Status.CANCELLED && m.status != MilestoneStatus.PAID
                    && m.status != MilestoneStatus.VOID
            );
        if (!cancellable) revert InvalidMilestoneStatus(milestoneId, m.status);

        ProjectFunds storage f = funds[m.projectId];
        f.allocated -= m.amount;
        f.unsettled -= 1;
        emit MilestoneVoided(milestoneId, m.projectId, reasonHash);
        _setStatus(m, MilestoneStatus.VOID);
    }

    /// @notice Return unallocated balance of a CANCELLED or COMPLETED project to the treasury (H-1).
    function refundUnallocated(uint256 projectId) external nonReentrant whenNotPaused {
        IProjectRegistry.Project memory p = registry.getProject(projectId);
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, _msgSender(), p.wardId);
        if (p.status != IProjectRegistry.Status.CANCELLED && p.status != IProjectRegistry.Status.COMPLETED) {
            revert InvalidProjectStatus(projectId, p.status);
        }
        ProjectFunds storage f = funds[projectId];
        uint128 amount = f.balance - f.allocated;
        if (amount == 0) revert NothingToRefund(projectId);
        f.balance -= amount;
        emit UnallocatedRefunded(projectId, treasury, amount);

        if (mode == Mode.ESCROW) _send(treasury, amount);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    /// @inheritdoc IMilestoneEscrow
    function unsettledMilestones(uint256 projectId) external view returns (uint256) {
        return funds[projectId].unsettled;
    }

    function getMilestone(uint256 milestoneId) external view returns (Milestone memory) {
        return _existing(milestoneId);
    }

    /// @notice Whether `auditor` approved `milestoneId` in its current round.
    function hasApproved(uint256 milestoneId, address auditor) external view returns (bool) {
        Milestone storage m = _existing(milestoneId);
        return _approved[milestoneId][m.round][auditor];
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _fund(uint256 projectId, uint256 amount, bytes32 refHash) private {
        IProjectRegistry.Project memory p = registry.getProject(projectId);
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, _msgSender(), p.wardId);
        _requireActive(p);
        if (amount == 0) revert ZeroAmount();
        ProjectFunds storage f = funds[projectId];
        uint256 remaining = uint256(p.budget) - f.funded;
        if (amount > remaining) revert FundingExceedsBudget(projectId, amount, remaining);
        f.funded += uint128(amount);
        f.balance += uint128(amount);
        emit ProjectFunded(projectId, _msgSender(), amount, refHash, f.balance);
    }

    function _existing(uint256 milestoneId) private view returns (Milestone storage m) {
        if (milestoneId == 0 || milestoneId > milestoneCount) revert MilestoneNotFound(milestoneId);
        m = _milestones[milestoneId];
    }

    function _requireActive(IProjectRegistry.Project memory p) private pure {
        if (p.status != IProjectRegistry.Status.ACTIVE) revert ProjectNotActive(p.id, p.status);
    }

    function _setStatus(Milestone storage m, MilestoneStatus status) private {
        m.status = status;
        emit MilestoneStatusChanged(m.id, m.projectId, status);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed(to, amount);
    }
}
