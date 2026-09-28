import { expect } from "chai";
import { deployWithRoles, ethers, networkHelpers, upgradesApi } from "./helpers/fixture.js";

async function ledgerFixture() {
  return deployWithRoles("LEDGER");
}

describe("Deployment & wiring", function () {
  it("wires registry to escrow, tender and grievance exactly once", async function () {
    const d = await networkHelpers.loadFixture(ledgerFixture);
    expect(await d.registry.escrow()).to.equal(await d.escrow.getAddress());
    expect(await d.registry.tenderRegistry()).to.equal(await d.tender.getAddress());
    expect(await d.registry.grievanceRegistry()).to.equal(await d.grievance.getAddress());
    await expect(d.registry.setEscrow(d.outsider.address)).to.be.revertedWithCustomError(d.registry, "AlreadySet");
  });

  it("grievance registry trusts the forwarder", async function () {
    const d = await networkHelpers.loadFixture(ledgerFixture);
    expect(await d.grievance.trustedForwarder()).to.equal(await d.forwarder.getAddress());
  });

  it("tracks role member counts without AccessControlEnumerable", async function () {
    const d = await networkHelpers.loadFixture(ledgerFixture);
    expect(await d.access.getRoleMemberCount(d.roles.AUDITOR)).to.equal(3n);
    await d.access.revokeRole(d.roles.AUDITOR, d.auditor3.address);
    expect(await d.access.getRoleMemberCount(d.roles.AUDITOR)).to.equal(2n);
    await d.access.revokeRole(d.roles.AUDITOR, d.auditor3.address); // no-op
    expect(await d.access.getRoleMemberCount(d.roles.AUDITOR)).to.equal(2n);
  });

  it("only ADMIN can upgrade, and upgrades keep state", async function () {
    const d = await networkHelpers.loadFixture(ledgerFixture);
    const Registry = await ethers.getContractFactory("ProjectRegistry", d.outsider);
    await expect(upgradesApi.upgradeProxy(await d.registry.getAddress(), Registry)).to.be.revertedWithCustomError(
      d.registry,
      "Unauthorized",
    );
    const escrowAddr = await d.registry.escrow();
    const upgraded = await upgradesApi.upgradeProxy(
      await d.registry.getAddress(),
      await ethers.getContractFactory("ProjectRegistry", d.admin),
      { redeployImplementation: "always" },
    );
    expect(await upgraded.escrow()).to.equal(escrowAddr);
  });

  it("implementations cannot be initialized directly", async function () {
    const d = await networkHelpers.loadFixture(ledgerFixture);
    const impl = await upgradesApi.erc1967.getImplementationAddress(await d.registry.getAddress());
    const registryImpl = await ethers.getContractAt("ProjectRegistry", impl);
    await expect(registryImpl.initialize(await d.access.getAddress())).to.be.revertedWithCustomError(
      registryImpl,
      "InvalidInitialization",
    );
  });
});
