// End-to-end happy path on a deployed network (plan §5.2), printing an explorer link per step:
//   create project → 2-of-N auditor approval → fund → milestone → contractor proof
//   → 2 auditor approvals → release → citizen grievance + upvote (relayer).
// Uses throwaway actor wallets funded from the deployer, which must still hold ADMIN (testnets).
// Leftover gas is swept back to the deployer at the end.
//   pnpm --filter @namma-seva/contracts smoke:mst-testnet
import { network } from "hardhat";
import type { ContractTransactionResponse, HDNodeWallet } from "ethers";
import { readDeployment, txLink } from "./lib/deployments.js";

const { ethers, networkName } = await network.create();
const d = readDeployment(networkName);
const [deployer] = await ethers.getSigners();
const c = (name: string) => d.contracts[name].address;

const access = await ethers.getContractAt("NammaSevaAccess", c("NammaSevaAccess"));
const registry = await ethers.getContractAt("ProjectRegistry", c("ProjectRegistry"));
const escrow = await ethers.getContractAt("MilestoneEscrow", c("MilestoneEscrow"));
const grievance = await ethers.getContractAt("GrievanceRegistry", c("GrievanceRegistry"));

const WARD = 1;
const escrowMode = d.mode === "ESCROW";
// ESCROW: tiny amounts of native coin. LEDGER: INR paise (₹5,00,000 budget, ₹2,00,000 milestone).
const BUDGET = escrowMode ? ethers.parseEther("0.002") : 5_00_000_00n;
const MILESTONE = escrowMode ? ethers.parseEther("0.001") : 2_00_000_00n;
const GAS_FLOAT = ethers.parseEther(networkName === "localhost" ? "1" : "0.02");

const h = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
let step = 0;
async function run(label: string, tx: Promise<ContractTransactionResponse>) {
  const sent = await tx;
  const receipt = await sent.wait();
  console.log(`${String(++step).padStart(2)}. ${label.padEnd(44)} gas ${String(receipt!.gasUsed).padStart(7)}  ${txLink(d.chainId, sent.hash)}`);
  return receipt!;
}

console.log(`\nSmoke test on ${networkName} (chain ${d.chainId}, ${d.mode} mode)\n`);
if (!(await access.hasRole(await access.DEFAULT_ADMIN_ROLE(), deployer.address))) {
  throw new Error("Deployer is not ADMIN — the smoke test only runs before governance handover.");
}

const actors = {
  official: ethers.Wallet.createRandom().connect(ethers.provider),
  auditor1: ethers.Wallet.createRandom().connect(ethers.provider),
  auditor2: ethers.Wallet.createRandom().connect(ethers.provider),
  contractor: ethers.Wallet.createRandom().connect(ethers.provider),
  relayer: ethers.Wallet.createRandom().connect(ethers.provider),
} satisfies Record<string, HDNodeWallet>;

// 0. Setup: fund actors for gas, grant roles and ward access.
for (const [name, w] of Object.entries(actors)) {
  const extra = name === "official" && escrowMode ? BUDGET : 0n;
  await (await deployer.sendTransaction({ to: w.address, value: GAS_FLOAT + extra })).wait();
}
await run("grant GOVT_OFFICIAL", access.grantRole(await access.GOVT_OFFICIAL_ROLE(), actors.official.address));
await run("grant AUDITOR ×2", access.grantRole(await access.AUDITOR_ROLE(), actors.auditor1.address));
await (await access.grantRole(await access.AUDITOR_ROLE(), actors.auditor2.address)).wait();
await run("grant CONTRACTOR", access.grantRole(await access.CONTRACTOR_ROLE(), actors.contractor.address));
await run("grant RELAYER", access.grantRole(await access.RELAYER_ROLE(), actors.relayer.address));
for (const w of [actors.official, actors.auditor1, actors.auditor2]) {
  await (await access.setWardAccess(w.address, WARD, true)).wait();
}

// 1. Project lifecycle
const now = (await ethers.provider.getBlock("latest"))!.timestamp;
const metadata = JSON.stringify({ title: "Smoke test — 80 Feet Road resurfacing", ward: WARD, at: now });
const createReceipt = await run(
  "official: createProject",
  registry.connect(actors.official).createProject({
    metaHash: ethers.keccak256(ethers.toUtf8Bytes(metadata)),
    metaCID: "bafkreismoketestmetadata",
    wardId: WARD,
    departmentId: 1,
    category: 0,
    latE6: 12_934_533,
    lngE6: 77_626_579,
    budget: BUDGET,
    startDate: BigInt(now),
    endDate: BigInt(now + 90 * 24 * 3600),
    contractor: actors.contractor.address,
    approvalThreshold: 2,
  }),
);
const created = createReceipt.logs
  .map((l) => {
    try {
      return registry.interface.parseLog(l);
    } catch {
      return null;
    }
  })
  .find((e) => e?.name === "ProjectCreated");
const projectId = created!.args.projectId as bigint;

await run("auditor 1: approveProject", registry.connect(actors.auditor1).approveProject(projectId));
await run("auditor 2: approveProject → ACTIVE", registry.connect(actors.auditor2).approveProject(projectId));
await run(
  escrowMode ? "official: fundProject (native escrow)" : "official: recordSanction (PFMS ref)",
  escrowMode
    ? escrow.connect(actors.official).fundProject(projectId, { value: BUDGET })
    : escrow.connect(actors.official).recordSanction(projectId, BUDGET, h("PFMS/SMOKE/0001")),
);
await run("official: createMilestone", escrow.connect(actors.official).createMilestone(projectId, h("m1"), "bafkreismokemilestone", MILESTONE));
const milestoneId = await escrow.milestoneCount();
await run(
  "contractor: submitProof (IPFS + GPS)",
  escrow.connect(actors.contractor).submitProof(milestoneId, "bafkreismokeproof", h("proof.json"), 12_934_540, 77_626_570),
);
await run("auditor 1: approveMilestone", escrow.connect(actors.auditor1).approveMilestone(milestoneId));
await run("auditor 2: approveMilestone → APPROVED", escrow.connect(actors.auditor2).approveMilestone(milestoneId));
await run(
  "official: releaseFunds",
  escrow.connect(actors.official).releaseFunds(milestoneId, escrowMode ? ethers.ZeroHash : h("UTR/SMOKE/0001")),
);

// 2. Citizens (gasless via relayer)
await run(
  "relayer: fileGrievance (citizen hash)",
  grievance.connect(actors.relayer).fileGrievance(projectId, 1, "bafkreismokegrievance", h("citizen:+91-smoke-1")),
);
const grievanceId = await grievance.grievanceCount();
await run("relayer: upvote (another citizen)", grievance.connect(actors.relayer).upvote(grievanceId, h("citizen:+91-smoke-2")));

// 3. Check final state
const p = await registry.getProject(projectId);
const m = await escrow.getMilestone(milestoneId);
if (p.spent !== MILESTONE || m.status !== 4n) throw new Error(`Unexpected end state: spent=${p.spent} status=${m.status}`);
console.log(`\n✓ Lifecycle complete: project #${projectId} spent ${p.spent} of ${p.budget}; milestone #${milestoneId} PAID.`);

// 4. Sweep leftover gas back to the deployer (best effort).
const feeData = await ethers.provider.getFeeData();
const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
for (const w of Object.values(actors)) {
  const bal = await ethers.provider.getBalance(w.address);
  const cost = 21_000n * gasPrice * 2n;
  if (bal > cost) await (await w.sendTransaction({ to: deployer.address, value: bal - cost, gasLimit: 21_000n })).wait().catch(() => {});
}
console.log("✓ Swept leftover gas back to the deployer.");
