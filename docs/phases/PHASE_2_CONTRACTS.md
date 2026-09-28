# Phase 2 — Smart Contracts v2 on MST Testnet

> **Status (2026-09-28):** ✅ contracts, tests, tooling and local end-to-end run complete. Remaining: **(You)** deploy + verify + smoke on MST testnet with a funded deployer key — see [runbook](../runbooks/deploy-mst-testnet.md).

**Duration:** Weeks 2–3 · **Depends on:** Phase 1 · **Plan refs:** §3.2, §7, §8, §16.1

## Goal
Rewrite the DecentraliTrack contracts with every audit defect fixed, add grievance/tender/forwarder contracts, and deploy + verify the full set on MST testnet. **This is the demo checkpoint.**

## 1. Hardhat project (`packages/contracts`)
Port from `DecentraliTrack/decentralitrack/contracts`:
- [x] `hardhat.config.js` → `hardhat.config.ts` (plan §8.1): Solidity `0.8.24`, optimizer 200, `viaIR`, `evmVersion: "shanghai"` (ADR 0003 — mainnet lacks Cancun), networks `hardhat` (pinned to Shanghai) / `localhost` / `mstTestnet` / `mstMainnet`, Blockscout `chainDescriptors`. *Hardhat 3 on Node 22 (ADR 0008).*
- [x] Plugins: hardhat-ethers, chai-matchers, mocha, network-helpers, typechain, verify, `@openzeppelin/hardhat-upgrades`. *Coverage and gas stats are built into Hardhat 3.*
- [x] Scripts per §8.2 (`compile`, `test`, `coverage`, `deploy:*`, `verify:*`, `roles:*`, `export-abis`).

## 2. Contracts
| Contract | Source | Must fix / add |
|---|---|---|
| `NammaSevaAccess` | `RoleManager.sol` | Roles `ADMIN, GOVT_OFFICIAL, AUDITOR, CONTRACTOR, RELAYER`; ward/department scoping; `Pausable` |
| `ProjectRegistry` | `ProjectRegistry.sol` | **C-1** `onlyEscrow` on `addSpentAmount` / `incrementMilestoneCount`; **M-1** close only when all milestones settled; **M-3** `metaHash` + `metaCID` instead of strings; per-project `approvalThreshold`; packed struct (§7.3) |
| `MilestoneEscrow` | `MilestoneEscrow.sol` | **C-2** only assigned contractor submits proof; **H-1** fund only ACTIVE projects + `refundUnallocated`; **H-2** require ACTIVE for approve/release; **H-3** cumulative `allocated` ≤ `escrowBalance`; **H-4** M-of-N (default 2); **M-2** bounded approvers; ledger vs escrow mode flag (§7.4) |
| `GrievanceRegistry` | new | `fileGrievance(projectId, cid, category, citizenHash)`, `upvote`, `respond(id, responseCID, action)`, `GrievanceThresholdReached` |
| `TenderRegistry` | new | publish, sealed-bid commit/reveal, `award` → `assignContractor` |
| `TrustedForwarder` | OZ `ERC2771Forwarder` | gasless citizen actions |

- [x] OpenZeppelin v5 (**pinned 5.4.0** — 5.5+ uses Cancun `mcopy`, ADR 0008), custom errors, NatSpec, `ReentrancyGuard` on value-moving fns.
- [x] Every event carries `indexed projectId` (+ `indexed actor`) and the CID/hash. *CIDs live in events only; storage keeps content hashes (ADR 0009).*
- [x] State machines exactly as §7.2 (project + milestone).
- [x] UUPS proxies for Registry / Escrow / Grievance / Tender; `upgradeTo` gated by ADMIN → `NammaSevaMultisig` + 48 h `TimelockController` (no Safe on MST — ADR 0006).

## 3. Tests
- [x] `test/DecentraliTrack.test.js` → per-contract TS suites (100 tests).
- [x] One **regression test per §3.2 defect** — `AuditFindings.test.ts` runs each exploit against the unchanged legacy contracts (succeeds) and v2 (blocked).
- [x] Every function, revert, event and role check; **100 % lines** on Access/Registry/Escrow/Tender/Multisig, 98.6 % Grievance (unreachable ERC-2771 `_msgData` override).
- [x] Invariants (Foundry-style Solidity tests run by Hardhat 3): funds conserved, `sum(paid) ≤ sum(funded)`, `spent == sum(paid milestones)`, `allocated ≤ escrowBalance`, escrow solvent, unsettled count — probe-verified to reach releases.
- [x] Upgrade storage-layout validation via `hardhat-upgrades` (every proxy deploy/upgrade in tests + scripts).
- [x] Gas snapshot vs §7.6 targets — `createProject` meets it; others 102–158k after optimisation (≤ 0.00016 MSTC). Gaps accepted, see ADR 0009.
- [x] Slither: 0 findings. Aderyn: 4 "High" all triaged as false positives — [triage](../security/phase-2-static-analysis.md).

## 4. Deploy to MST testnet
- [x] `scripts/deploy.ts`: `Access → Forwarder → Registry(proxy) → Escrow(proxy) → Grievance(proxy) → Tender(proxy)`, then registry wiring; optional multisig + timelock.
- [x] Writes `deployments/<network>.json` (`chainId`, `blockNumber` = indexer start block, git `commit`, addresses).
- [x] `scripts/grantRoles.ts` reads `config/roles.mstTestnet.json` — **no hard-coded Hardhat accounts** (L-1).
- [x] `scripts/verify.ts` verifies implementations + plain contracts on mstscan (Blockscout). *Not yet run against the live explorer.*
- [x] `scripts/exportAbis.ts` → `packages/chain/src/abis/*.ts` (`as const`) + `src/deployments.ts` (replaces `findArtifactsBase()` and duplicated ABI JSON).
- [x] `scripts/smokeTest.ts`: runs the §5.2 happy path and prints mstscan links — passes on a local Shanghai node.

## Deliverables
- 6 contracts, deployed + verified on MST testnet.
- `packages/chain` populated with ABIs + addresses.
- Smoke-test transcript with mstscan links (use in the demo).

## Exit criteria
- [ ] **(You)** Full lifecycle executed on MST testnet and visible on testnet.mstscan.com — `pnpm smoke:mst-testnet` (✅ passes locally).
- [x] Coverage ≥ 95 %, Slither clean, all §3.2 regression tests green.
