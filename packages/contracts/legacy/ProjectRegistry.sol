// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RoleManager.sol";

contract ProjectRegistry {
    enum ProjectStatus {
        PENDING_APPROVAL,
        CREATED,
        ACTIVE,
        COMPLETED,
        PAUSED,
        CANCELLED
    }

    enum ProjectCategory {
        ROAD,
        DRAINAGE,
        WATER_SUPPLY,
        STREET_LIGHTING,
        PARK,
        BUILDING,
        OTHER
    }

    struct Project {
        uint256 id;
        string title;
        string description;
        string location;
        int256 latitude;
        int256 longitude;
        uint256 totalBudget;
        uint256 spentAmount;
        uint256 startDate;
        uint256 endDate;
        address officialAddress;
        address contractorAddress;
        ProjectStatus status;
        uint256 milestoneCount;
        ProjectCategory category;
    }

    RoleManager public immutable roleManager;
    uint256 private nextProjectId = 1;
    uint256[] private projectIds;
    mapping(uint256 => Project) private projects;

    event ProjectCreated(uint256 indexed projectId, string title, address indexed officialAddress, address indexed contractorAddress, uint256 totalBudget);
    event ProjectApproved(uint256 indexed projectId, address indexed auditor);
    event ProjectRejected(uint256 indexed projectId, address indexed auditor, string reason);
    event ProjectStatusUpdated(uint256 indexed projectId, ProjectStatus status);
    event ProjectPaused(uint256 indexed projectId, address indexed auditor);
    event ProjectResumed(uint256 indexed projectId, address indexed auditor);
    event ProjectClosed(uint256 indexed projectId, address indexed official);
    event ContractorAssigned(uint256 indexed projectId, address indexed contractor);
    event ProjectSpentUpdated(uint256 indexed projectId, uint256 spentAmount);
    event ProjectMilestoneCountUpdated(uint256 indexed projectId, uint256 milestoneCount);

    modifier onlyGovtOfficial() {
        require(roleManager.hasRole(roleManager.GOVT_OFFICIAL(), msg.sender), "Not government official");
        _;
    }

    modifier onlyAuditor() {
        require(roleManager.hasRole(roleManager.AUDITOR(), msg.sender), "Not auditor");
        _;
    }

    constructor(address roleManagerAddress) {
        require(roleManagerAddress != address(0), "Role manager required");
        roleManager = RoleManager(roleManagerAddress);
    }

    // Official creates a project — starts as PENDING_APPROVAL, contractor can be zero (tender flow)
    function createProject(
        string calldata title,
        string calldata description,
        string calldata location,
        int256 latitude,
        int256 longitude,
        uint256 budget,
        uint256 endDate,
        address contractor,
        ProjectCategory category
    ) external onlyGovtOfficial returns (uint256) {
        require(bytes(title).length > 0, "Title required");
        require(budget > 0, "Budget required");
        require(endDate > block.timestamp, "End date must be in future");

        uint256 projectId = nextProjectId++;
        projects[projectId] = Project({
            id: projectId,
            title: title,
            description: description,
            location: location,
            latitude: latitude,
            longitude: longitude,
            totalBudget: budget,
            spentAmount: 0,
            startDate: block.timestamp,
            endDate: endDate,
            officialAddress: msg.sender,
            contractorAddress: contractor,
            status: ProjectStatus.PENDING_APPROVAL,
            milestoneCount: 0,
            category: category
        });
        projectIds.push(projectId);
        emit ProjectCreated(projectId, title, msg.sender, contractor, budget);
        return projectId;
    }

    // Auditor approves a pending project → ACTIVE
    function approveProject(uint256 projectId) external onlyAuditor {
        require(projects[projectId].id != 0, "Project not found");
        require(projects[projectId].status == ProjectStatus.PENDING_APPROVAL, "Not pending approval");
        projects[projectId].status = ProjectStatus.ACTIVE;
        emit ProjectApproved(projectId, msg.sender);
        emit ProjectStatusUpdated(projectId, ProjectStatus.ACTIVE);
    }

    // Auditor rejects a pending project → CANCELLED
    function rejectProject(uint256 projectId, string calldata reason) external onlyAuditor {
        require(projects[projectId].id != 0, "Project not found");
        require(projects[projectId].status == ProjectStatus.PENDING_APPROVAL, "Not pending approval");
        projects[projectId].status = ProjectStatus.CANCELLED;
        emit ProjectRejected(projectId, msg.sender, reason);
        emit ProjectStatusUpdated(projectId, ProjectStatus.CANCELLED);
    }

    // Auditor pauses an active project (citizen concern)
    function pauseProject(uint256 projectId) external onlyAuditor {
        require(projects[projectId].id != 0, "Project not found");
        require(
            projects[projectId].status == ProjectStatus.ACTIVE ||
            projects[projectId].status == ProjectStatus.CREATED,
            "Cannot pause"
        );
        projects[projectId].status = ProjectStatus.PAUSED;
        emit ProjectPaused(projectId, msg.sender);
        emit ProjectStatusUpdated(projectId, ProjectStatus.PAUSED);
    }

    // Auditor resumes a paused project (citizen concern dismissed)
    function resumeProject(uint256 projectId) external onlyAuditor {
        require(projects[projectId].id != 0, "Project not found");
        require(projects[projectId].status == ProjectStatus.PAUSED, "Not paused");
        projects[projectId].status = ProjectStatus.ACTIVE;
        emit ProjectResumed(projectId, msg.sender);
        emit ProjectStatusUpdated(projectId, ProjectStatus.ACTIVE);
    }

    // Official closes a fully-paid project → COMPLETED
    function closeProject(uint256 projectId) external onlyGovtOfficial {
        require(projects[projectId].id != 0, "Project not found");
        require(projects[projectId].status == ProjectStatus.ACTIVE, "Project not active");
        projects[projectId].status = ProjectStatus.COMPLETED;
        emit ProjectClosed(projectId, msg.sender);
        emit ProjectStatusUpdated(projectId, ProjectStatus.COMPLETED);
    }

    // Official assigns a contractor after tender is awarded
    function assignContractor(uint256 projectId, address contractor) external onlyGovtOfficial {
        require(projects[projectId].id != 0, "Project not found");
        require(contractor != address(0), "Contractor address required");
        projects[projectId].contractorAddress = contractor;
        emit ContractorAssigned(projectId, contractor);
    }

    function incrementMilestoneCount(uint256 projectId) external {
        require(projects[projectId].id != 0, "Project not found");
        projects[projectId].milestoneCount += 1;
        emit ProjectMilestoneCountUpdated(projectId, projects[projectId].milestoneCount);
    }

    function addSpentAmount(uint256 projectId, uint256 amount) external {
        require(projects[projectId].id != 0, "Project not found");
        projects[projectId].spentAmount += amount;
        emit ProjectSpentUpdated(projectId, projects[projectId].spentAmount);
    }

    function getProject(uint256 projectId) external view returns (Project memory) {
        require(projects[projectId].id != 0, "Project not found");
        return projects[projectId];
    }

    function getAllProjectIds() external view returns (uint256[] memory) {
        return projectIds;
    }
}
