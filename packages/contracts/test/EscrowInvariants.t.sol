// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {NammaSevaAccess} from "../contracts/NammaSevaAccess.sol";
import {ProjectRegistry} from "../contracts/ProjectRegistry.sol";
import {MilestoneEscrow} from "../contracts/MilestoneEscrow.sol";
import {IProjectRegistry} from "../contracts/interfaces/IProjectRegistry.sol";

/// @dev Drives the escrow through random action sequences. Reverting calls are discarded by the
///      invariant runner (failOnRevert = false), so ghost totals only count successful actions.
contract EscrowHandler is Test {
    NammaSevaAccess internal access;
    ProjectRegistry internal registry;
    MilestoneEscrow internal escrow;
    uint256 internal projectId;

    address internal official = makeAddr("official");
    address internal auditor1 = makeAddr("auditor1");
    address internal auditor2 = makeAddr("auditor2");
    address internal contractor = makeAddr("contractor");

    uint256 public ghostFunded;
    uint256 public ghostReleased;
    uint256 public ghostRefunded;
    uint256 public ghostPaidMilestoneSum;

    constructor(NammaSevaAccess a, ProjectRegistry r, MilestoneEscrow e, uint256 pid) {
        access = a;
        registry = r;
        escrow = e;
        projectId = pid;
        vm.deal(official, type(uint128).max);
    }

    uint256 public ghostReleaseCount;
    uint256 public ghostRejectCount;
    uint256 public ghostVoidCount;

    function fund(uint256 amount) external {
        _fund(bound(amount, 1, 1e21));
    }

    function createMilestone(uint256 amount) external {
        (, uint128 balance, uint128 allocated,) = escrow.funds(projectId);
        uint256 available = uint256(balance) - allocated;
        if (available == 0) {
            _fund(1e20);
            available = 1e20;
        }
        amount = bound(amount, 1, available);
        vm.prank(official);
        escrow.createMilestone(projectId, keccak256("m"), "cid", amount);
    }

    /// Moves a random milestone one valid step: prove → approve → approve → release.
    function advance(uint256 seed) external {
        if (escrow.milestoneCount() == 0) return;
        uint256 id = _milestone(seed);
        MilestoneEscrow.MilestoneStatus s = escrow.getMilestone(id).status;
        if (s == MilestoneEscrow.MilestoneStatus.PENDING || s == MilestoneEscrow.MilestoneStatus.REJECTED) {
            vm.prank(contractor);
            escrow.submitProof(id, "proof", keccak256("p"), 12_971_599, 77_594_566);
        } else if (s == MilestoneEscrow.MilestoneStatus.PROOF_SUBMITTED) {
            vm.prank(escrow.hasApproved(id, auditor1) ? auditor2 : auditor1);
            escrow.approveMilestone(id);
        } else if (s == MilestoneEscrow.MilestoneStatus.APPROVED) {
            uint256 amount = escrow.getMilestone(id).amount;
            vm.prank(official);
            escrow.releaseFunds(id, bytes32(0));
            ghostReleased += amount;
            ghostPaidMilestoneSum += amount;
            ghostReleaseCount += 1;
        }
    }

    function reject(uint256 seed) external {
        if (escrow.milestoneCount() == 0) return;
        uint256 id = _milestone(seed);
        MilestoneEscrow.MilestoneStatus s = escrow.getMilestone(id).status;
        if (s != MilestoneEscrow.MilestoneStatus.PROOF_SUBMITTED && s != MilestoneEscrow.MilestoneStatus.APPROVED) return;
        vm.prank(auditor1);
        escrow.rejectMilestone(id, keccak256("r"));
        ghostRejectCount += 1;
    }

    function cancel(uint256 seed) external {
        if (escrow.milestoneCount() == 0) return;
        uint256 id = _milestone(seed);
        MilestoneEscrow.MilestoneStatus s = escrow.getMilestone(id).status;
        if (s != MilestoneEscrow.MilestoneStatus.PENDING && s != MilestoneEscrow.MilestoneStatus.REJECTED) return;
        vm.prank(official);
        escrow.cancelMilestone(id, keccak256("c"));
        ghostVoidCount += 1;
    }

    function togglePause(uint256 seed) external {
        // Pause rarely (1 in 8) so most sequences make progress; always allow resuming.
        bool paused = registry.getProject(projectId).status == IProjectRegistry.Status.PAUSED;
        vm.prank(auditor1);
        if (paused) registry.resumeProject(projectId);
        else if (seed % 8 == 0) registry.pauseProject(projectId, keccak256("x"));
    }

    function _fund(uint256 amount) internal {
        vm.prank(official);
        escrow.fundProject{value: amount}(projectId);
        ghostFunded += amount;
    }

    function _milestone(uint256 seed) internal view returns (uint256) {
        uint256 count = escrow.milestoneCount();
        return count == 0 ? 1 : bound(seed, 1, count);
    }
}

/// @notice Plan §16.1 escrow invariants, checked after every random action sequence.
contract EscrowInvariantsTest is Test {
    NammaSevaAccess internal access;
    ProjectRegistry internal registry;
    MilestoneEscrow internal escrow;
    EscrowHandler internal handler;
    uint256 internal projectId;

    function setUp() public {
        access = new NammaSevaAccess(address(this));
        registry = ProjectRegistry(
            address(new ERC1967Proxy(address(new ProjectRegistry()), abi.encodeCall(ProjectRegistry.initialize, (address(access)))))
        );
        escrow = MilestoneEscrow(
            payable(
                address(
                    new ERC1967Proxy(
                        address(new MilestoneEscrow()),
                        abi.encodeCall(
                            MilestoneEscrow.initialize,
                            (address(access), address(registry), MilestoneEscrow.Mode.ESCROW, makeAddr("treasury"))
                        )
                    )
                )
            )
        );
        registry.setEscrow(address(escrow));

        address official = makeAddr("official");
        address auditor1 = makeAddr("auditor1");
        address auditor2 = makeAddr("auditor2");
        address contractor = makeAddr("contractor");
        access.grantRole(access.GOVT_OFFICIAL_ROLE(), official);
        access.grantRole(access.AUDITOR_ROLE(), auditor1);
        access.grantRole(access.AUDITOR_ROLE(), auditor2);
        access.grantRole(access.CONTRACTOR_ROLE(), contractor);
        uint32 all = access.ALL_WARDS();
        access.setWardAccess(official, all, true);
        access.setWardAccess(auditor1, all, true);
        access.setWardAccess(auditor2, all, true);

        vm.prank(official);
        projectId = registry.createProject(
            ProjectRegistry.NewProject({
                metaHash: keccak256("meta"),
                metaCID: "cid",
                wardId: 1,
                departmentId: 1,
                category: IProjectRegistry.Category.ROAD,
                latE6: 12_971_599,
                lngE6: 77_594_566,
                budget: 1e24,
                startDate: uint64(block.timestamp),
                endDate: uint64(block.timestamp + 365 days),
                contractor: contractor,
                approvalThreshold: 2
            })
        );
        vm.prank(auditor1);
        registry.approveProject(projectId);
        vm.prank(auditor2);
        registry.approveProject(projectId);

        handler = new EscrowHandler(access, registry, escrow, projectId);
        targetContract(address(handler));
    }

    /// The contract always holds exactly the project's recorded balance (ESCROW mode is solvent).
    function invariant_escrowHoldsRecordedBalance() public view {
        (, uint128 balance,,) = escrow.funds(projectId);
        assertEq(address(escrow).balance, balance);
    }

    /// sum(paid) <= sum(funded)
    function invariant_paidNeverExceedsFunded() public view {
        assertLe(handler.ghostReleased(), handler.ghostFunded());
    }

    /// allocated <= escrowBalance (H-3)
    function invariant_allocatedWithinBalance() public view {
        (, uint128 balance, uint128 allocated,) = escrow.funds(projectId);
        assertLe(allocated, balance);
    }

    /// funded == balance + released (+ refunded, none while ACTIVE/PAUSED)
    function invariant_fundsConserved() public view {
        (uint128 funded, uint128 balance,,) = escrow.funds(projectId);
        assertEq(funded, handler.ghostFunded());
        assertEq(uint256(funded), uint256(balance) + handler.ghostReleased() + handler.ghostRefunded());
    }

    /// registry.spent == sum of PAID milestone amounts, and never exceeds budget
    function invariant_spentMatchesPaidMilestones() public view {
        IProjectRegistry.Project memory p = registry.getProject(projectId);
        assertEq(p.spent, handler.ghostPaidMilestoneSum());
        assertLe(p.spent, p.budget);
    }

    /// unsettled == number of milestones not PAID/VOID
    function invariant_unsettledCountMatches() public view {
        uint256 open;
        uint256 n = escrow.milestoneCount();
        for (uint256 i = 1; i <= n; ++i) {
            MilestoneEscrow.MilestoneStatus s = escrow.getMilestone(i).status;
            if (s != MilestoneEscrow.MilestoneStatus.PAID && s != MilestoneEscrow.MilestoneStatus.VOID) ++open;
        }
        assertEq(escrow.unsettledMilestones(projectId), open);
    }
}
