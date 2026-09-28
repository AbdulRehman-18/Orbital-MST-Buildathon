// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ProjectRegistry.sol";
import "./RoleManager.sol";

contract MilestoneEscrow is ReentrancyGuard {
    enum MilestoneStatus {
        PENDING,
        PROOF_SUBMITTED,
        APPROVED,
        REJECTED,
        PAID
    }

    struct Milestone {
        uint256 id;
        uint256 projectId;
        string title;
        string description;
        uint256 paymentAmount;
        string ipfsProofCID;
        int256 proofLatitude;
        int256 proofLongitude;
        uint256 submittedAt;
        uint256 approvedAt;
        address submittedBy;
        MilestoneStatus status;
        uint256 approvalCount;
        string rejectionReason;
        address[] approversList;
        mapping(address => bool) hasApproved;
    }

    struct MilestoneView {
        uint256 id;
        uint256 projectId;
        string title;
        string description;
        uint256 paymentAmount;
        string ipfsProofCID;
        int256 proofLatitude;
        int256 proofLongitude;
        uint256 submittedAt;
        uint256 approvedAt;
        address submittedBy;
        MilestoneStatus status;
        uint256 approvalCount;
        string rejectionReason;
    }

    ProjectRegistry public immutable projectRegistry;
    RoleManager public immutable roleManager;
    uint256 public constant APPROVAL_THRESHOLD = 1;
    uint256 private nextMilestoneId = 1;
    mapping(uint256 => Milestone) private milestones;
    mapping(uint256 => uint256[]) private projectMilestones;
    mapping(uint256 => uint256) public projectEscrowBalance;

    event ProjectFunded(uint256 indexed projectId, uint256 amount, address indexed officialAddress);
    event MilestoneCreated(uint256 indexed milestoneId, uint256 indexed projectId);
    event ProofSubmitted(uint256 indexed milestoneId, string ipfsCID, int256 latitude, int256 longitude, address indexed submittedBy);
    event MilestoneApproved(uint256 indexed milestoneId, address indexed approvedBy, uint256 approvalCount);
    event FundsReleased(uint256 indexed milestoneId, uint256 amount, address indexed contractorAddress);
    event MilestoneRejected(uint256 indexed milestoneId, string reason);

    modifier onlyGovtOfficial() {
        require(roleManager.hasRole(roleManager.GOVT_OFFICIAL(), msg.sender), "Not government official");
        _;
    }

    modifier onlyAuditor() {
        require(roleManager.hasRole(roleManager.AUDITOR(), msg.sender), "Not auditor");
        _;
    }

    constructor(address projectRegistryAddress, address roleManagerAddress) {
        require(projectRegistryAddress != address(0), "Project registry required");
        require(roleManagerAddress != address(0), "Role manager required");
        projectRegistry = ProjectRegistry(projectRegistryAddress);
        roleManager = RoleManager(roleManagerAddress);
    }

    receive() external payable {}

    // Official funds the escrow before milestones can be created
    function fundProject(uint256 projectId) external payable onlyGovtOfficial {
        require(msg.value > 0, "Funds required");
        projectEscrowBalance[projectId] += msg.value;
        emit ProjectFunded(projectId, msg.value, msg.sender);
    }

    // Official creates a milestone against an escrow-funded project
    function createMilestone(
        uint256 projectId,
        string calldata title,
        string calldata description,
        uint256 paymentAmount
    ) external onlyGovtOfficial returns (uint256) {
        require(paymentAmount > 0, "Payment required");
        require(projectEscrowBalance[projectId] >= paymentAmount, "Insufficient escrow");
        projectRegistry.getProject(projectId);

        uint256 milestoneId = nextMilestoneId++;
        Milestone storage milestone = milestones[milestoneId];
        milestone.id = milestoneId;
        milestone.projectId = projectId;
        milestone.title = title;
        milestone.description = description;
        milestone.paymentAmount = paymentAmount;
        milestone.status = MilestoneStatus.PENDING;
        projectMilestones[projectId].push(milestoneId);
        projectRegistry.incrementMilestoneCount(projectId);
        emit MilestoneCreated(milestoneId, projectId);
        return milestoneId;
    }

    // Contractor submits IPFS proof with GPS coordinates
    function submitProof(
        uint256 milestoneId,
        string calldata ipfsCID,
        int256 latitude,
        int256 longitude
    ) external {
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.id != 0, "Milestone not found");
        require(
            milestone.status == MilestoneStatus.PENDING ||
            milestone.status == MilestoneStatus.REJECTED,
            "Invalid status for proof submission"
        );
        require(bytes(ipfsCID).length > 0, "CID required");

        milestone.ipfsProofCID = ipfsCID;
        milestone.proofLatitude = latitude;
        milestone.proofLongitude = longitude;
        milestone.submittedAt = block.timestamp;
        milestone.submittedBy = msg.sender;
        milestone.status = MilestoneStatus.PROOF_SUBMITTED;
        milestone.rejectionReason = "";
        emit ProofSubmitted(milestoneId, ipfsCID, latitude, longitude, msg.sender);
    }

    // Auditor approves the proof — does NOT auto-release funds
    function approveMilestone(uint256 milestoneId) external onlyAuditor nonReentrant {
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.id != 0, "Milestone not found");
        require(
            milestone.status == MilestoneStatus.PROOF_SUBMITTED ||
            milestone.status == MilestoneStatus.APPROVED,
            "Proof not submitted"
        );
        require(!milestone.hasApproved[msg.sender], "Already approved");

        milestone.hasApproved[msg.sender] = true;
        milestone.approversList.push(msg.sender);
        milestone.approvalCount += 1;
        milestone.status = MilestoneStatus.APPROVED;
        milestone.approvedAt = block.timestamp;
        emit MilestoneApproved(milestoneId, msg.sender, milestone.approvalCount);
    }

    // Official manually releases funds after auditor approval
    function releaseFunds(uint256 milestoneId) external onlyGovtOfficial nonReentrant {
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.id != 0, "Milestone not found");
        require(milestone.status == MilestoneStatus.APPROVED, "Milestone not approved");
        require(milestone.approvalCount >= APPROVAL_THRESHOLD, "Threshold not met");
        require(projectEscrowBalance[milestone.projectId] >= milestone.paymentAmount, "Escrow insufficient");

        ProjectRegistry.Project memory project = projectRegistry.getProject(milestone.projectId);
        projectEscrowBalance[milestone.projectId] -= milestone.paymentAmount;
        milestone.status = MilestoneStatus.PAID;
        projectRegistry.addSpentAmount(milestone.projectId, milestone.paymentAmount);
        (bool sent, ) = payable(project.contractorAddress).call{value: milestone.paymentAmount}("");
        require(sent, "Payment failed");
        emit FundsReleased(milestoneId, milestone.paymentAmount, project.contractorAddress);
    }

    // Auditor rejects proof — clears all prior approvals so resubmission starts fresh
    function rejectMilestone(uint256 milestoneId, string calldata reason) external onlyAuditor {
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.id != 0, "Milestone not found");
        require(
            milestone.status == MilestoneStatus.PROOF_SUBMITTED ||
            milestone.status == MilestoneStatus.APPROVED,
            "Invalid status"
        );

        for (uint256 i = 0; i < milestone.approversList.length; i++) {
            milestone.hasApproved[milestone.approversList[i]] = false;
        }
        delete milestone.approversList;
        milestone.approvalCount = 0;
        milestone.approvedAt = 0;
        milestone.status = MilestoneStatus.REJECTED;
        milestone.rejectionReason = reason;
        emit MilestoneRejected(milestoneId, reason);
    }

    function getProjectMilestones(uint256 projectId) external view returns (MilestoneView[] memory) {
        uint256[] memory ids = projectMilestones[projectId];
        MilestoneView[] memory result = new MilestoneView[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = milestoneToView(milestones[ids[i]]);
        }
        return result;
    }

    function getMilestone(uint256 milestoneId) external view returns (MilestoneView memory) {
        require(milestones[milestoneId].id != 0, "Milestone not found");
        return milestoneToView(milestones[milestoneId]);
    }

    function milestoneToView(Milestone storage milestone) private view returns (MilestoneView memory) {
        return MilestoneView({
            id: milestone.id,
            projectId: milestone.projectId,
            title: milestone.title,
            description: milestone.description,
            paymentAmount: milestone.paymentAmount,
            ipfsProofCID: milestone.ipfsProofCID,
            proofLatitude: milestone.proofLatitude,
            proofLongitude: milestone.proofLongitude,
            submittedAt: milestone.submittedAt,
            approvedAt: milestone.approvedAt,
            submittedBy: milestone.submittedBy,
            status: milestone.status,
            approvalCount: milestone.approvalCount,
            rejectionReason: milestone.rejectionReason
        });
    }
}
