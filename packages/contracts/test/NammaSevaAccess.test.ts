import { expect } from "chai";
import { deployWithRoles, ethers, networkHelpers, OTHER_WARD, WARD } from "./helpers/fixture.js";

async function fixture() {
  return deployWithRoles("LEDGER");
}

describe("NammaSevaAccess", function () {
  it("rejects a zero admin", async function () {
    await networkHelpers.loadFixture(fixture);
    const F = await ethers.getContractFactory("NammaSevaAccess");
    await expect(ethers.deployContract("NammaSevaAccess", [ethers.ZeroAddress])).to.be.revertedWithCustomError(F, "ZeroAddress");
  });

  it("scopes accounts to wards, including ALL_WARDS and batch grants", async function () {
    const d = await networkHelpers.loadFixture(fixture);
    const a = d.outsider.address;
    expect(await d.access.hasWardAccess(a, WARD)).to.equal(false);
    await expect(d.access.setWardAccessBatch(a, [WARD, OTHER_WARD], true))
      .to.emit(d.access, "WardAccessSet")
      .withArgs(a, WARD, true)
      .and.to.emit(d.access, "WardAccessSet")
      .withArgs(a, OTHER_WARD, true);
    expect(await d.access.hasWardAccess(a, OTHER_WARD)).to.equal(true);
    await d.access.setWardAccessBatch(a, [WARD, OTHER_WARD], false);
    expect(await d.access.hasWardAccess(a, WARD)).to.equal(false);

    // auditor3 has ALL_WARDS
    expect(await d.access.hasWardAccess(d.auditor3.address, 123456)).to.equal(true);
    expect(await d.access.hasRoleInWard(d.roles.AUDITOR, d.auditor3.address, 123456)).to.equal(true);
    expect(await d.access.hasRoleInWard(d.roles.AUDITOR, d.auditor1.address, OTHER_WARD)).to.equal(false);
    expect(await d.access.hasRoleInWard(d.roles.OFFICIAL, d.auditor3.address, WARD)).to.equal(false);
  });

  it("only ADMIN sets wards, never for the zero address", async function () {
    const d = await networkHelpers.loadFixture(fixture);
    await expect(d.access.connect(d.official).setWardAccess(d.official.address, WARD, true)).to.be.revertedWithCustomError(
      d.access,
      "AccessControlUnauthorizedAccount",
    );
    await expect(d.access.connect(d.official).setWardAccessBatch(d.official.address, [WARD], true)).to.be.revertedWithCustomError(
      d.access,
      "AccessControlUnauthorizedAccount",
    );
    await expect(d.access.setWardAccess(ethers.ZeroAddress, WARD, true)).to.be.revertedWithCustomError(d.access, "ZeroAddress");
  });

  it("PAUSER pauses, only ADMIN unpauses", async function () {
    const d = await networkHelpers.loadFixture(fixture);
    const PAUSER = await d.access.PAUSER_ROLE();
    await d.access.grantRole(PAUSER, d.auditor1.address);
    await d.access.connect(d.auditor1).pause();
    expect(await d.access.paused()).to.equal(true);
    await expect(d.access.connect(d.auditor1).unpause()).to.be.revertedWithCustomError(
      d.access,
      "AccessControlUnauthorizedAccount",
    );
    await expect(d.access.connect(d.outsider).pause()).to.be.revertedWithCustomError(d.access, "AccessControlUnauthorizedAccount");
    await d.access.unpause();
    expect(await d.access.paused()).to.equal(false);
  });

  it("role constants used by the other contracts match (NammaSevaBase keeps local copies)", async function () {
    const d = await networkHelpers.loadFixture(fixture);
    const id = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
    expect(await d.access.GOVT_OFFICIAL_ROLE()).to.equal(id("GOVT_OFFICIAL"));
    expect(await d.access.AUDITOR_ROLE()).to.equal(id("AUDITOR"));
    expect(await d.access.CONTRACTOR_ROLE()).to.equal(id("CONTRACTOR"));
    expect(await d.access.RELAYER_ROLE()).to.equal(id("RELAYER"));
    expect(await d.access.DEFAULT_ADMIN_ROLE()).to.equal(ethers.ZeroHash);
  });
});
