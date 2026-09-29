// Owner CLI for NammaSevaMultisig (+ its timelock). MST has no Safe UI (ADR 0006), so owners
// propose, confirm and execute admin actions with this script, each from their own wallet.
//
//   pnpm --filter @namma-seva/contracts multisig mstMainnet list
//   ... multisig mstMainnet call access pause
//   ... multisig mstMainnet call access "grantRole(bytes32,address)" '["<role id>","0x…"]' --timelock
//   ... multisig mstMainnet confirm 7
//   ... multisig mstMainnet execute 7
//   ... multisig mstMainnet call access "unpause()" --timelock --execute-scheduled --salt <salt>
//
// `call` encodes calldata for a target contract from the manifest and submits it as a multisig
// transaction (your confirmation is automatic). With `--timelock` the call is wrapped in
// TimelockController.schedule(...) (delay = the timelock's minimum), or in execute(...) with
// `--execute-scheduled` once the delay has passed. `pause` is the only action that skips the timelock:
// the multisig itself holds PAUSER so an emergency stop needs just the signature threshold.
// Signing wallet: DEPLOYER_PRIVATE_KEY (each owner uses their own key) or DEPLOYER_MODE=hardware.
import { network } from "hardhat";
import { randomBytes } from "node:crypto";
import { readDeployment } from "./lib/deployments.ts";

// Hardhat's `run` task takes no positional arguments, so this runs as a plain Node script:
//   node --experimental-strip-types --no-warnings scripts/multisig.ts <network> <command…>
const [networkArg, ...argv] = process.argv.slice(2);
if (!networkArg) throw new Error("usage: multisig.ts <mstTestnet|mstMainnet|localhost> <command…>");
const { ethers, networkName } = await network.create(networkArg);
const d = readDeployment(networkName);
const multisigAddr = d.contracts.NammaSevaMultisig?.address;
const timelockAddr = d.contracts.NammaSevaTimelock?.address;
if (!multisigAddr || !timelockAddr) throw new Error(`${networkName} has no multisig/timelock in its manifest`);

const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

// `--as <n>` picks the n-th unlocked account: local rehearsals against `hardhat node` only.
const signer = (await ethers.getSigners())[Number(opt("as") ?? 0)];
const multisig = await ethers.getContractAt("NammaSevaMultisig", multisigAddr, signer);
const timelock = await ethers.getContractAt("NammaSevaTimelock", timelockAddr, signer);

const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--salt", "--as"].includes(argv[i - 1])));
const [cmd, ...rest] = positional;

const TARGETS: Record<string, string> = {
  access: "NammaSevaAccess",
  registry: "ProjectRegistry",
  escrow: "MilestoneEscrow",
  grievance: "GrievanceRegistry",
  tender: "TenderRegistry",
};

async function show(id: bigint) {
  const t = await multisig.getTransaction(id);
  const threshold = await multisig.threshold();
  const mine = await multisig.confirmedBy(id, signer.address);
  console.log(
    `#${id}  to ${t.to}  ${t.executed ? "EXECUTED" : `${t.confirmations}/${threshold} confirmations${mine ? " (you confirmed)" : ""}`}  data ${t.data.slice(0, 74)}${t.data.length > 74 ? "…" : ""}`,
  );
}

switch (cmd) {
  case "list": {
    const n = await multisig.transactionCount();
    console.log(`Multisig ${multisigAddr} — ${await multisig.threshold()}-of-${(await multisig.getOwners()).length}, ${n} transaction(s). You are ${signer.address} (${(await multisig.isOwner(signer.address)) ? "owner" : "NOT an owner"}).`);
    for (let i = 0n; i < n; i++) await show(i);
    break;
  }
  case "call": {
    const [targetKey, signature, argsJson] = rest;
    const targetName = TARGETS[targetKey];
    if (!targetName) throw new Error(`Target must be one of: ${Object.keys(TARGETS).join(", ")}`);
    const target = d.contracts[targetName].address;
    const iface = (await ethers.getContractAt(targetName, target)).interface;
    const fn = iface.getFunction(signature.includes("(") ? signature : `${signature}()`);
    if (!fn) throw new Error(`No function ${signature} on ${targetName}`);
    const calldata = iface.encodeFunctionData(fn, argsJson ? JSON.parse(argsJson) : []);

    let to = target;
    let data = calldata;
    if (flag("timelock")) {
      const salt = opt("salt") ?? ethers.hexlify(randomBytes(32));
      if (flag("execute-scheduled")) {
        data = timelock.interface.encodeFunctionData("execute", [target, 0, calldata, ethers.ZeroHash, salt]);
      } else {
        const delay = await timelock.getMinDelay();
        data = timelock.interface.encodeFunctionData("schedule", [target, 0, calldata, ethers.ZeroHash, salt, delay]);
        console.log(`Timelock salt (keep it — needed to execute after ${Number(delay) / 3600} h): ${salt}`);
      }
      to = timelockAddr;
    } else if (fn.name !== "pause") {
      console.warn(`⚠ ${fn.name} normally needs ADMIN (held by the timelock): add --timelock, or this will fail when executed.`);
    }
    const tx = await multisig.submit(to, 0, data);
    const receipt = await tx.wait();
    const id = (await multisig.transactionCount()) - 1n;
    console.log(`Submitted multisig tx #${id} (${receipt?.hash}). Ask the other owners to: confirm ${id}`);
    break;
  }
  case "confirm":
    await (await multisig.confirm(BigInt(rest[0]))).wait();
    await show(BigInt(rest[0]));
    break;
  case "revoke":
    await (await multisig.revoke(BigInt(rest[0]))).wait();
    await show(BigInt(rest[0]));
    break;
  case "execute":
    await (await multisig.execute(BigInt(rest[0]))).wait();
    await show(BigInt(rest[0]));
    break;
  default:
    console.log("commands: list | call <target> <fn> [argsJson] [--timelock [--execute-scheduled] [--salt 0x…]] | confirm <id> | revoke <id> | execute <id>");
    process.exit(cmd ? 1 : 0);
}
