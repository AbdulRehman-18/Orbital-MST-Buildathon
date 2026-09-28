import { expect } from "chai";
import { deployWithRoles, ethers, networkHelpers, upgradesApi, WARD } from "./helpers/fixture.js";
import { handOverAdmin } from "../scripts/lib/governance.js";

const DELAY = 48 * 60 * 60;

async function fixture() {
  const d = await deployWithRoles("LEDGER");
  const [, , , , , , , , , , , o1, o2, o3, o4, o5] = await ethers.getSigners();
  const owners = [o1, o2, o3, o4, o5];
  const multisig = await ethers.deployContract("NammaSevaMultisig", [owners.map((o) => o.address), 3]);
  const msAddr = await multisig.getAddress();
  const timelock = await ethers.deployContract("NammaSevaTimelock", [DELAY, [msAddr], [msAddr], ethers.ZeroAddress]);
  return { ...d, multisig, timelock, owners };
}

describe("Governance: multisig + timelock (ADR 0006)", function () {
  describe("NammaSevaMultisig", function () {
    it("executes only after the threshold of owner confirmations", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const [o1, o2, o3] = d.owners;
      const target = d.outsider.address;
      await o1.sendTransaction({ to: await d.multisig.getAddress(), value: 1000n });

      await expect(d.multisig.connect(o1).submit(target, 100n, "0x")).to.emit(d.multisig, "Submitted");
      await expect(d.multisig.connect(o1).execute(0))
        .to.be.revertedWithCustomError(d.multisig, "NotEnoughConfirmations")
        .withArgs(0n, 1n, 3n);
      await d.multisig.connect(o2).confirm(0);
      await expect(d.multisig.connect(o2).confirm(0)).to.be.revertedWithCustomError(d.multisig, "AlreadyConfirmed");
      await d.multisig.connect(o2).revoke(0);
      await expect(d.multisig.connect(o2).revoke(0)).to.be.revertedWithCustomError(d.multisig, "NotConfirmed");
      await d.multisig.connect(o2).confirm(0);
      await d.multisig.connect(o3).confirm(0);
      await expect(d.multisig.connect(o3).execute(0)).to.changeEtherBalance(ethers, d.outsider, 100n);
      await expect(d.multisig.connect(o1).execute(0)).to.be.revertedWithCustomError(d.multisig, "TxAlreadyExecuted");
      expect((await d.multisig.getTransaction(0)).executed).to.equal(true);
      expect(await d.multisig.transactionCount()).to.equal(1n);
    });

    it("guards owners, self-calls and bad inputs", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const [o1, o2, o3] = d.owners;
      await expect(d.multisig.connect(d.outsider).submit(o1.address, 0, "0x")).to.be.revertedWithCustomError(
        d.multisig,
        "NotOwner",
      );
      await expect(d.multisig.connect(o1).addOwner(d.outsider.address)).to.be.revertedWithCustomError(d.multisig, "NotSelf");
      await expect(d.multisig.connect(o1).confirm(5)).to.be.revertedWithCustomError(d.multisig, "TxNotFound");
      await expect(d.multisig.getTransaction(5)).to.be.revertedWithCustomError(d.multisig, "TxNotFound");
      await expect(d.multisig.connect(o1).submit(o1.address, 2n ** 96n, "0x")).to.be.revertedWithCustomError(
        d.multisig,
        "ValueTooLarge",
      );

      // failing inner call surfaces as ExecutionFailed
      const bad = d.multisig.interface.encodeFunctionData("changeThreshold", [9]);
      await d.multisig.connect(o1).submit(await d.multisig.getAddress(), 0, bad);
      await d.multisig.connect(o2).confirm(0);
      await d.multisig.connect(o3).confirm(0);
      await expect(d.multisig.connect(o1).execute(0)).to.be.revertedWithCustomError(d.multisig, "ExecutionFailed");
    });

    it("manages owners and threshold through its own transactions", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const [o1, o2, o3, , o5] = d.owners;
      const self = await d.multisig.getAddress();
      const run = async (data: string) => {
        const id = await d.multisig.transactionCount();
        await d.multisig.connect(o1).submit(self, 0, data);
        await d.multisig.connect(o2).confirm(id);
        await d.multisig.connect(o3).confirm(id);
        await d.multisig.connect(o1).execute(id);
      };
      await run(d.multisig.interface.encodeFunctionData("addOwner", [d.outsider.address]));
      expect(await d.multisig.isOwner(d.outsider.address)).to.equal(true);
      await run(d.multisig.interface.encodeFunctionData("removeOwner", [o5.address]));
      expect(await d.multisig.getOwners()).to.have.length(5);
      await run(d.multisig.interface.encodeFunctionData("changeThreshold", [4]));
      expect(await d.multisig.threshold()).to.equal(4);
    });

    it("refuses owner changes that break limits", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const [o1, o2, o3, o4, o5] = d.owners;
      const self = await d.multisig.getAddress();
      const attempt = async (data: string) => {
        const id = await d.multisig.transactionCount();
        await d.multisig.connect(o1).submit(self, 0, data);
        await d.multisig.connect(o2).confirm(id);
        await d.multisig.connect(o3).confirm(id);
        return d.multisig.connect(o1).execute(id);
      };
      const iface = d.multisig.interface;
      await expect(attempt(iface.encodeFunctionData("removeOwner", [d.outsider.address]))).to.be.revertedWithCustomError(
        d.multisig,
        "ExecutionFailed",
      );
      // 5 owners, threshold 3: removing down to 3 is fine, below threshold is not
      await attempt(iface.encodeFunctionData("removeOwner", [o5.address]));
      await attempt(iface.encodeFunctionData("removeOwner", [o4.address]));
      await expect(attempt(iface.encodeFunctionData("removeOwner", [o3.address]))).to.be.revertedWithCustomError(
        d.multisig,
        "ExecutionFailed",
      );
      // grow to MAX_OWNERS, then one more fails
      const extra = (await ethers.getSigners()).slice(1, 8);
      for (const s of extra) await attempt(iface.encodeFunctionData("addOwner", [s.address]));
      expect(await d.multisig.getOwners()).to.have.length(10);
      await expect(attempt(iface.encodeFunctionData("addOwner", [d.outsider.address]))).to.be.revertedWithCustomError(
        d.multisig,
        "ExecutionFailed",
      );
    });

    it("rejects invalid constructor params", async function () {
      await networkHelpers.loadFixture(fixture);
      const [a, b] = await ethers.getSigners();
      const F = await ethers.getContractFactory("NammaSevaMultisig");
      await expect(ethers.deployContract("NammaSevaMultisig", [[], 1])).to.be.revertedWithCustomError(F, "InvalidThreshold");
      await expect(ethers.deployContract("NammaSevaMultisig", [[a.address], 2])).to.be.revertedWithCustomError(
        F,
        "InvalidThreshold",
      );
      await expect(ethers.deployContract("NammaSevaMultisig", [[a.address, a.address], 1])).to.be.revertedWithCustomError(
        F,
        "InvalidOwner",
      );
      await expect(ethers.deployContract("NammaSevaMultisig", [[b.address, ethers.ZeroAddress], 1])).to.be.revertedWithCustomError(
        F,
        "InvalidOwner",
      );
    });
  });

  describe("admin handover", function () {
    it("moves ADMIN/PAUSER to the timelock and the deployer renounces", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const ADMIN = await d.access.DEFAULT_ADMIN_ROLE();
      const PAUSER = await d.access.PAUSER_ROLE();
      await handOverAdmin(d.access, await d.timelock.getAddress(), d.admin.address);

      expect(await d.access.hasRole(ADMIN, await d.timelock.getAddress())).to.equal(true);
      expect(await d.access.hasRole(PAUSER, await d.timelock.getAddress())).to.equal(true);
      expect(await d.access.hasRole(ADMIN, d.admin.address)).to.equal(false);
      expect(await d.access.hasRole(PAUSER, d.admin.address)).to.equal(false);
      await expect(d.access.setWardAccess(d.outsider.address, WARD, true)).to.be.revertedWithCustomError(
        d.access,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("upgrades then require multisig proposal + 48 h delay", async function () {
      const d = await networkHelpers.loadFixture(fixture);
      const [o1, o2, o3] = d.owners;
      await handOverAdmin(d.access, await d.timelock.getAddress(), d.admin.address);

      const proxy = await d.registry.getAddress();
      const newImpl = await upgradesApi.prepareUpgrade(proxy, await ethers.getContractFactory("ProjectRegistry"), {
        redeployImplementation: "always",
      });
      const upgradeCall = d.registry.interface.encodeFunctionData("upgradeToAndCall", [newImpl as string, "0x"]);
      const salt = ethers.ZeroHash;
      const tl = d.timelock;
      const scheduleData = tl.interface.encodeFunctionData("schedule", [proxy, 0, upgradeCall, ethers.ZeroHash, salt, DELAY]);
      const executeData = tl.interface.encodeFunctionData("execute", [proxy, 0, upgradeCall, ethers.ZeroHash, salt]);
      const tlAddr = await tl.getAddress();

      const viaMultisig = async (data: string) => {
        const id = await d.multisig.transactionCount();
        await d.multisig.connect(o1).submit(tlAddr, 0, data);
        await d.multisig.connect(o2).confirm(id);
        await d.multisig.connect(o3).confirm(id);
        return d.multisig.connect(o1).execute(id);
      };

      // the old deployer can no longer upgrade directly
      await expect(d.registry.upgradeToAndCall(newImpl as string, "0x")).to.be.revertedWithCustomError(
        d.registry,
        "Unauthorized",
      );
      await viaMultisig(scheduleData);
      await expect(viaMultisig(executeData)).to.be.revertedWithCustomError(d.multisig, "ExecutionFailed"); // too early
      await networkHelpers.time.increase(DELAY);
      await viaMultisig(executeData);
      expect(await upgradesApi.erc1967.getImplementationAddress(proxy)).to.equal(newImpl);
    });
  });
});
