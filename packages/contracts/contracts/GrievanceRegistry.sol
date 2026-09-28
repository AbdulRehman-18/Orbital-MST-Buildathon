// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {NammaSevaBase} from "./NammaSevaBase.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";

/// @title GrievanceRegistry
/// @notice Citizen complaints about a project, upvotes, escalation at a threshold, and auditor
///         responses (plan §15). No personal data on-chain: citizens are identified only by
///         `citizenHash` — a salted hash of their OTP-verified phone number computed off-chain.
/// @dev Citizens never pay gas. Two submission paths, both keyed by `citizenHash`:
///      1. The backend RELAYER calls directly and supplies the citizen's hash.
///      2. A per-citizen signing key (derived and custodied by the backend, plan §9.4) is
///         registered once by the RELAYER; requests it signs are executed through the trusted
///         ERC-2771 forwarder by anyone (normally the relayer, which pays the gas).
contract GrievanceRegistry is NammaSevaBase, ERC2771ContextUpgradeable {
    enum Category {
        QUALITY,
        DELAY,
        SAFETY,
        MISSING_WORK,
        CORRUPTION,
        OTHER
    }

    enum Status {
        OPEN,
        ESCALATED,
        RESPONDED
    }

    enum Action {
        NONE,
        PAUSE_PROJECT,
        DISMISS
    }

    struct Grievance {
        bytes32 citizenHash;
        uint64 id;
        uint64 projectId;
        uint64 createdAt;
        uint32 upvotes;
        Category category;
        Status status;
        Action action;
        uint64 escalatedAt;
        uint64 respondedAt;
        // The grievance CID (moderated text + photo + GPS) and the auditor's response CID are
        // content-addressed and live in GrievanceFiled / GrievanceResponded (ADR 0008).
    }

    IProjectRegistry public registry;
    /// @notice Unique upvotes that escalate a grievance to the auditors.
    uint32 public escalationThreshold;
    /// @notice Grievances one citizen may file per UTC day (abuse control; the API enforces it too).
    uint8 public maxGrievancesPerDay;
    /// @notice Time auditors have to respond once escalated; overdue responses become anomalies.
    uint64 public responseSla;

    uint64 public grievanceCount;
    mapping(uint256 grievanceId => Grievance) private _grievances;
    mapping(uint256 grievanceId => mapping(bytes32 citizenHash => bool)) public hasUpvoted;
    mapping(address signer => bytes32 citizenHash) public citizenOfSigner;
    mapping(bytes32 citizenHash => mapping(uint256 day => uint256 count)) public filedOnDay;

    event CitizenSignerSet(address indexed signer, bytes32 indexed citizenHash);
    event SettingsUpdated(uint32 escalationThreshold, uint8 maxGrievancesPerDay, uint64 responseSla);
    event GrievanceFiled(
        uint256 indexed grievanceId,
        uint256 indexed projectId,
        bytes32 indexed citizenHash,
        Category category,
        string cid
    );
    event GrievanceUpvoted(uint256 indexed grievanceId, uint256 indexed projectId, bytes32 indexed citizenHash, uint32 upvotes);
    event GrievanceThresholdReached(uint256 indexed grievanceId, uint256 indexed projectId, uint32 upvotes, uint64 respondBy);
    event GrievanceResponded(
        uint256 indexed grievanceId, uint256 indexed projectId, address indexed auditor, Action action, string responseCID
    );

    error GrievanceNotFound(uint256 grievanceId);
    error NotACitizen(address account);
    error CitizenMismatch();
    error InvalidCitizen();
    error InvalidContent();
    error InvalidSettings();
    error DailyLimitReached(bytes32 citizenHash);
    error AlreadyUpvoted(uint256 grievanceId);
    error OwnGrievance(uint256 grievanceId);
    error InvalidGrievanceStatus(uint256 grievanceId, Status status);
    error ProjectClosedForGrievances(uint256 projectId, IProjectRegistry.Status status);
    error InvalidAction();

    /// @param trustedForwarder_ The {ERC2771Forwarder}; immutable, baked into the implementation.
    /// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
    constructor(address trustedForwarder_) ERC2771ContextUpgradeable(trustedForwarder_) {
        _disableInitializers();
    }

    function initialize(
        address access_,
        address registry_,
        uint32 escalationThreshold_,
        uint8 maxGrievancesPerDay_,
        uint64 responseSla_
    ) external initializer {
        __NammaSevaBase_init(access_);
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IProjectRegistry(registry_);
        _setSettings(escalationThreshold_, maxGrievancesPerDay_, responseSla_);
    }

    // ─── Admin / relayer ─────────────────────────────────────────────────────

    function setSettings(uint32 escalationThreshold_, uint8 maxGrievancesPerDay_, uint64 responseSla_)
        external
        onlyRole(ADMIN_ROLE)
    {
        _setSettings(escalationThreshold_, maxGrievancesPerDay_, responseSla_);
    }

    /// @notice RELAYER binds a backend-custodied per-citizen signing key to a citizen hash.
    ///         Pass `citizenHash = 0` to revoke.
    function setCitizenSigner(address signer, bytes32 citizenHash) external whenNotPaused {
        _checkRole(RELAYER_ROLE, _msgSender());
        if (signer == address(0)) revert ZeroAddress();
        citizenOfSigner[signer] = citizenHash;
        emit CitizenSignerSet(signer, citizenHash);
    }

    // ─── Citizens ────────────────────────────────────────────────────────────

    /// @notice File a grievance against a project that is not CANCELLED.
    /// @param citizenHash Required on the RELAYER path; on the signer path must be 0 or match.
    function fileGrievance(uint256 projectId, Category category, string calldata cid, bytes32 citizenHash)
        external
        whenNotPaused
        returns (uint256 grievanceId)
    {
        bytes32 citizen = _resolveCitizen(citizenHash);
        IProjectRegistry.Project memory p = registry.getProject(projectId);
        if (p.status == IProjectRegistry.Status.CANCELLED) revert ProjectClosedForGrievances(projectId, p.status);
        if (bytes(cid).length == 0) revert InvalidContent();

        uint256 day = block.timestamp / 1 days;
        if (filedOnDay[citizen][day] >= maxGrievancesPerDay) revert DailyLimitReached(citizen);
        filedOnDay[citizen][day] += 1;

        grievanceId = ++grievanceCount;
        Grievance storage g = _grievances[grievanceId];
        g.id = uint64(grievanceId);
        g.projectId = uint64(projectId);
        g.citizenHash = citizen;
        g.category = category;
        g.createdAt = uint64(block.timestamp);
        emit GrievanceFiled(grievanceId, projectId, citizen, category, cid);
    }

    /// @notice One upvote per citizen per grievance; escalates at `escalationThreshold`.
    function upvote(uint256 grievanceId, bytes32 citizenHash) external whenNotPaused {
        bytes32 citizen = _resolveCitizen(citizenHash);
        Grievance storage g = _existing(grievanceId);
        if (g.status == Status.RESPONDED) revert InvalidGrievanceStatus(grievanceId, g.status);
        if (g.citizenHash == citizen) revert OwnGrievance(grievanceId);
        if (hasUpvoted[grievanceId][citizen]) revert AlreadyUpvoted(grievanceId);

        hasUpvoted[grievanceId][citizen] = true;
        uint32 votes = ++g.upvotes;
        emit GrievanceUpvoted(grievanceId, g.projectId, citizen, votes);

        if (g.status == Status.OPEN && votes >= escalationThreshold) {
            g.status = Status.ESCALATED;
            g.escalatedAt = uint64(block.timestamp);
            emit GrievanceThresholdReached(grievanceId, g.projectId, votes, g.escalatedAt + responseSla);
        }
    }

    // ─── Auditors ────────────────────────────────────────────────────────────

    /// @notice Auditor of the project's ward responds. `PAUSE_PROJECT` pauses an ACTIVE project.
    function respond(uint256 grievanceId, string calldata responseCID, Action action) external whenNotPaused {
        Grievance storage g = _existing(grievanceId);
        IProjectRegistry.Project memory p = registry.getProject(g.projectId);
        address sender = _msgSender();
        _checkRoleInWard(AUDITOR_ROLE, sender, p.wardId);
        if (g.status == Status.RESPONDED) revert InvalidGrievanceStatus(grievanceId, g.status);
        if (action == Action.NONE) revert InvalidAction();
        if (bytes(responseCID).length == 0) revert InvalidContent();

        g.status = Status.RESPONDED;
        g.action = action;
        g.respondedAt = uint64(block.timestamp);
        emit GrievanceResponded(grievanceId, g.projectId, sender, action, responseCID);

        if (action == Action.PAUSE_PROJECT) registry.pauseByGrievance(g.projectId, grievanceId);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getGrievance(uint256 grievanceId) external view returns (Grievance memory) {
        return _existing(grievanceId);
    }

    /// @notice Whether an escalated grievance has passed its response deadline.
    function isOverdue(uint256 grievanceId) external view returns (bool) {
        Grievance storage g = _existing(grievanceId);
        return g.status == Status.ESCALATED && block.timestamp > uint256(g.escalatedAt) + responseSla;
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _resolveCitizen(bytes32 supplied) private view returns (bytes32 citizen) {
        address sender = _msgSender();
        if (access.hasRole(RELAYER_ROLE, sender)) {
            if (supplied == bytes32(0)) revert InvalidCitizen();
            return supplied;
        }
        citizen = citizenOfSigner[sender];
        if (citizen == bytes32(0)) revert NotACitizen(sender);
        if (supplied != bytes32(0) && supplied != citizen) revert CitizenMismatch();
    }

    function _existing(uint256 grievanceId) private view returns (Grievance storage g) {
        if (grievanceId == 0 || grievanceId > grievanceCount) revert GrievanceNotFound(grievanceId);
        g = _grievances[grievanceId];
    }

    function _setSettings(uint32 threshold, uint8 perDay, uint64 sla) private {
        if (threshold == 0 || perDay == 0 || sla == 0) revert InvalidSettings();
        escalationThreshold = threshold;
        maxGrievancesPerDay = perDay;
        responseSla = sla;
        emit SettingsUpdated(threshold, perDay, sla);
    }

    // ─── ERC-2771 plumbing ───────────────────────────────────────────────────

    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    function _contextSuffixLength()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (uint256)
    {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }
}
