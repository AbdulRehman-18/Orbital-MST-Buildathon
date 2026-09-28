// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {NammaSevaBase} from "./NammaSevaBase.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {ITenderRegistry} from "./interfaces/ITenderRegistry.sol";

/// @title TenderRegistry
/// @notice Sealed-bid tenders for projects without a contractor. Contractors commit a hash of
///         their bid, reveal it after the commit deadline, and the lowest valid revealed bid wins.
///         Award assigns the contractor on the {ProjectRegistry}.
/// @dev Bid commitments bind chain id, this contract, tender id and bidder, so a commitment can't
///      be replayed across tenders or copied by another bidder.
contract TenderRegistry is NammaSevaBase, ITenderRegistry {
    /// @notice Cap on bidders per tender (bounded storage and view gas).
    uint16 public constant MAX_BIDDERS = 64;

    enum Status {
        OPEN,
        AWARDED,
        CANCELLED
    }

    struct Tender {
        uint64 id;
        uint64 projectId;
        uint64 commitDeadline;
        uint64 revealDeadline;
        address winner;
        Status status;
        uint16 bidCount;
        uint16 revealedCount;
        uint128 winningBid;
    }

    struct Bid {
        bytes32 commitHash;
        uint128 amount;
        uint64 revealedAt;
        bool revealed;
    }

    IProjectRegistry public registry;
    uint64 public tenderCount;
    mapping(uint256 tenderId => Tender) private _tenders;
    mapping(uint256 tenderId => mapping(address bidder => Bid)) private _bids;
    mapping(uint256 tenderId => address[]) private _bidders;
    mapping(uint256 projectId => uint256 tenderId) public openTenderOf;

    event TenderPublished(
        uint256 indexed tenderId,
        uint256 indexed projectId,
        address indexed official,
        string metaCID,
        uint64 commitDeadline,
        uint64 revealDeadline
    );
    event BidCommitted(uint256 indexed tenderId, address indexed bidder, bytes32 commitHash);
    event BidRevealed(uint256 indexed tenderId, address indexed bidder, uint256 amount);
    event TenderAwarded(uint256 indexed tenderId, uint256 indexed projectId, address indexed winner, uint256 amount);
    event TenderCancelled(uint256 indexed tenderId, uint256 indexed projectId, bytes32 reasonHash);

    error TenderNotFound(uint256 tenderId);
    error TenderNotOpen(uint256 tenderId, Status status);
    error InvalidProjectForTender(uint256 projectId);
    error TenderAlreadyOpen(uint256 projectId, uint256 tenderId);
    error InvalidDeadlines();
    error InvalidMetadata();
    error CommitPhaseOver(uint256 tenderId);
    error NotInRevealPhase(uint256 tenderId);
    error RevealPhaseNotOver(uint256 tenderId);
    error TooManyBidders(uint256 tenderId);
    error NoCommitment(uint256 tenderId, address bidder);
    error AlreadyRevealed(uint256 tenderId, address bidder);
    error CommitmentMismatch();
    error InvalidBidAmount(uint256 amount);
    error NoValidBids(uint256 tenderId);
    error ConflictOfInterest(address account);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address access_, address registry_) external initializer {
        __NammaSevaBase_init(access_);
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IProjectRegistry(registry_);
    }

    /// @notice Official publishes a tender for a project in their ward that has no contractor.
    function publishTender(uint256 projectId, string calldata metaCID, uint64 commitDeadline, uint64 revealDeadline)
        external
        whenNotPaused
        returns (uint256 tenderId)
    {
        IProjectRegistry.Project memory p = registry.getProject(projectId);
        address sender = _msgSender();
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, sender, p.wardId);
        if (
            p.contractor != address(0)
                || (p.status != IProjectRegistry.Status.PENDING_APPROVAL && p.status != IProjectRegistry.Status.ACTIVE)
        ) revert InvalidProjectForTender(projectId);
        if (openTenderOf[projectId] != 0) revert TenderAlreadyOpen(projectId, openTenderOf[projectId]);
        if (commitDeadline <= block.timestamp || revealDeadline <= commitDeadline) revert InvalidDeadlines();
        if (bytes(metaCID).length == 0) revert InvalidMetadata();

        tenderId = ++tenderCount;
        Tender storage t = _tenders[tenderId];
        t.id = uint64(tenderId);
        t.projectId = uint64(projectId);
        t.commitDeadline = commitDeadline;
        t.revealDeadline = revealDeadline; // tender document CID is only emitted (ADR 0008)
        openTenderOf[projectId] = tenderId;
        emit TenderPublished(tenderId, projectId, sender, metaCID, commitDeadline, revealDeadline);
    }

    /// @notice Contractor commits (or replaces) a sealed bid before the commit deadline.
    /// @param commitHash {computeCommitment}(tenderId, bidder, amount, salt)
    function commitBid(uint256 tenderId, bytes32 commitHash) external whenNotPaused {
        Tender storage t = _open(tenderId);
        address sender = _msgSender();
        _checkRole(CONTRACTOR_ROLE, sender);
        if (block.timestamp > t.commitDeadline) revert CommitPhaseOver(tenderId);
        if (commitHash == bytes32(0)) revert CommitmentMismatch();
        if (registry.getProject(t.projectId).official == sender) revert ConflictOfInterest(sender);

        Bid storage b = _bids[tenderId][sender];
        if (b.commitHash == bytes32(0)) {
            if (t.bidCount >= MAX_BIDDERS) revert TooManyBidders(tenderId);
            t.bidCount += 1;
            _bidders[tenderId].push(sender);
        }
        b.commitHash = commitHash;
        emit BidCommitted(tenderId, sender, commitHash);
    }

    /// @notice Reveal a committed bid between the commit and reveal deadlines.
    function revealBid(uint256 tenderId, uint256 amount, bytes32 salt) external whenNotPaused {
        Tender storage t = _open(tenderId);
        address sender = _msgSender();
        if (block.timestamp <= t.commitDeadline || block.timestamp > t.revealDeadline) revert NotInRevealPhase(tenderId);

        Bid storage b = _bids[tenderId][sender];
        if (b.commitHash == bytes32(0)) revert NoCommitment(tenderId, sender);
        if (b.revealed) revert AlreadyRevealed(tenderId, sender);
        if (computeCommitment(tenderId, sender, amount, salt) != b.commitHash) revert CommitmentMismatch();
        uint256 budget = registry.getProject(t.projectId).budget;
        if (amount == 0 || amount > budget) revert InvalidBidAmount(amount);

        b.revealed = true;
        b.amount = uint128(amount);
        b.revealedAt = uint64(block.timestamp);
        t.revealedCount += 1;
        // Strictly lower wins; on a tie the earlier reveal keeps the lead.
        if (t.winner == address(0) || amount < t.winningBid) {
            t.winner = sender;
            t.winningBid = uint128(amount);
        }
        emit BidRevealed(tenderId, sender, amount);
    }

    /// @notice Official awards the tender to the lowest revealed bid and assigns the contractor.
    function awardTender(uint256 tenderId) external whenNotPaused {
        Tender storage t = _open(tenderId);
        IProjectRegistry.Project memory p = registry.getProject(t.projectId);
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, _msgSender(), p.wardId);
        if (block.timestamp <= t.revealDeadline) revert RevealPhaseNotOver(tenderId);
        if (t.winner == address(0)) revert NoValidBids(tenderId);

        t.status = Status.AWARDED;
        delete openTenderOf[t.projectId];
        emit TenderAwarded(tenderId, t.projectId, t.winner, t.winningBid);
        registry.assignContractor(t.projectId, t.winner);
    }

    /// @notice Official cancels an OPEN tender (e.g. no valid bids).
    function cancelTender(uint256 tenderId, bytes32 reasonHash) external whenNotPaused {
        Tender storage t = _open(tenderId);
        IProjectRegistry.Project memory p = registry.getProject(t.projectId);
        _checkRoleInWard(GOVT_OFFICIAL_ROLE, _msgSender(), p.wardId);
        t.status = Status.CANCELLED;
        delete openTenderOf[t.projectId];
        emit TenderCancelled(tenderId, t.projectId, reasonHash);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    /// @notice The commitment a bidder must submit for `amount` with secret `salt`.
    function computeCommitment(uint256 tenderId, address bidder, uint256 amount, bytes32 salt)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), tenderId, bidder, amount, salt));
    }

    /// @inheritdoc ITenderRegistry
    function hasOpenTender(uint256 projectId) external view returns (bool) {
        return openTenderOf[projectId] != 0;
    }

    function getTender(uint256 tenderId) external view returns (Tender memory) {
        return _existing(tenderId);
    }

    function getBid(uint256 tenderId, address bidder) external view returns (Bid memory) {
        _existing(tenderId);
        return _bids[tenderId][bidder];
    }

    function getBidders(uint256 tenderId) external view returns (address[] memory) {
        _existing(tenderId);
        return _bidders[tenderId];
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _existing(uint256 tenderId) private view returns (Tender storage t) {
        if (tenderId == 0 || tenderId > tenderCount) revert TenderNotFound(tenderId);
        t = _tenders[tenderId];
    }

    function _open(uint256 tenderId) private view returns (Tender storage t) {
        t = _existing(tenderId);
        if (t.status != Status.OPEN) revert TenderNotOpen(tenderId, t.status);
    }
}
