// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {NammaSevaAccess} from "../contracts/NammaSevaAccess.sol";
import {ProjectRegistry} from "../contracts/ProjectRegistry.sol";
import {MilestoneEscrow} from "../contracts/MilestoneEscrow.sol";
import {TenderRegistry} from "../contracts/TenderRegistry.sol";
import {IProjectRegistry} from "../contracts/interfaces/IProjectRegistry.sol";

/// @notice Property-based tests for input validation and accounting edges.
contract FuzzTest is Test {
    NammaSevaAccess internal access;
    ProjectRegistry internal registry;
    MilestoneEscrow internal escrow;
    TenderRegistry internal tender;

    address internal official = makeAddr("official");
    address internal auditor1 = makeAddr("auditor1");
    address internal auditor2 = makeAddr("auditor2");
    address internal contractor = makeAddr("contractor");

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
                            (address(access), address(registry), MilestoneEscrow.Mode.LEDGER, makeAddr("treasury"))
                        )
                    )
                )
            )
        );
        tender = TenderRegistry(
            address(
                new ERC1967Proxy(
                    address(new TenderRegistry()),
                    abi.encodeCall(TenderRegistry.initialize, (address(access), address(registry)))
                )
            )
        );
        registry.setEscrow(address(escrow));
        registry.setTenderRegistry(address(tender));

        access.grantRole(access.GOVT_OFFICIAL_ROLE(), official);
        access.grantRole(access.AUDITOR_ROLE(), auditor1);
        access.grantRole(access.AUDITOR_ROLE(), auditor2);
        access.grantRole(access.CONTRACTOR_ROLE(), contractor);
        uint32 all = access.ALL_WARDS();
        access.setWardAccess(official, all, true);
        access.setWardAccess(auditor1, all, true);
        access.setWardAccess(auditor2, all, true);
    }

    function _params(int32 lat, int32 lng, uint128 budget) internal view returns (ProjectRegistry.NewProject memory) {
        return ProjectRegistry.NewProject({
            metaHash: keccak256("meta"),
            metaCID: "cid",
            wardId: 1,
            departmentId: 1,
            category: IProjectRegistry.Category.ROAD,
            latE6: lat,
            lngE6: lng,
            budget: budget,
            startDate: uint64(block.timestamp),
            endDate: uint64(block.timestamp + 30 days),
            contractor: contractor,
            approvalThreshold: 2
        });
    }

    function _active(uint128 budget) internal returns (uint256 id) {
        vm.prank(official);
        id = registry.createProject(_params(0, 0, budget));
        vm.prank(auditor1);
        registry.approveProject(id);
        vm.prank(auditor2);
        registry.approveProject(id);
    }

    /// Any coordinate inside the valid ranges is accepted; anything outside reverts.
    function testFuzz_coordinateBounds(int32 lat, int32 lng) public {
        bool valid = lat >= -90_000_000 && lat <= 90_000_000 && lng >= -180_000_000 && lng <= 180_000_000;
        if (!valid) vm.expectRevert(ProjectRegistry.InvalidCoordinates.selector);
        vm.prank(official);
        registry.createProject(_params(lat, lng, 1_000));
    }

    /// Sanctions can never push total funding past the project budget.
    function testFuzz_fundingCappedAtBudget(uint128 budget, uint128 first, uint128 second) public {
        budget = uint128(bound(budget, 1, type(uint128).max));
        uint256 id = _active(budget);
        first = uint128(bound(first, 1, budget));
        vm.prank(official);
        escrow.recordSanction(id, first, keccak256("s1"));
        second = uint128(bound(second, 1, type(uint128).max));
        if (uint256(first) + second > budget) {
            vm.expectRevert();
        }
        vm.prank(official);
        escrow.recordSanction(id, second, keccak256("s2"));
        (uint128 funded,,,) = escrow.funds(id);
        assertLe(funded, budget);
    }

    /// A commitment only opens with the exact (bidder, amount, salt) it was made from.
    function testFuzz_commitmentBinding(uint256 amount, bytes32 salt, uint256 otherAmount, bytes32 otherSalt) public view {
        vm.assume(amount != otherAmount || salt != otherSalt);
        bytes32 c = tender.computeCommitment(1, contractor, amount, salt);
        assertTrue(c != tender.computeCommitment(1, contractor, otherAmount, otherSalt));
        assertTrue(c != tender.computeCommitment(1, official, amount, salt));
        assertTrue(c != tender.computeCommitment(2, contractor, amount, salt));
    }
}
