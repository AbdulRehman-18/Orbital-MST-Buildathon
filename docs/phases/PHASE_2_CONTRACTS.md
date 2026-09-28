# Phase 2 — Smart Contracts v2 on MST Testnet

**Duration:** Weeks 2–3 · **Depends on:** Phase 1 · **Plan refs:** §3.2, §7, §8, §16.1

## Goal
Rewrite the DecentraliTrack contracts with every audit defect fixed, add grievance/tender/forwarder contracts, and deploy + verify the full set on MST testnet. **This is the demo checkpoint.**

## 1. Hardhat project (`packages/contracts`)
Port from `DecentraliTrack/decentralitrack/contracts`:
- [ ] `hardhat.config.js` → `hardhat.config.ts` (plan §8.1): Solidity `0.8.24`, optimizer 200, `viaIR`, `evmVersion: "shanghai"` (ADR 0003 — mainnet lacks Cancun), networks `hardhat` / `mstTestnet` / `mstMainnet`, Blockscout `customChains`.
- [ ] Plugins: `hardhat-toolbox`, `@openzeppelin/hardhat-upgrades`, `hardhat-gas-reporter`, `solidity-coverage`.
- [ ] Scripts per §8.2 (`compile`, `test`, `coverage`, `deploy:*`, `verify:*`, `roles:*`, `export-abis`).

## 2. Contracts
| Contract | Source | Must fix / add |
|---|---|---|
| `NammaSevaAccess` | `RoleManager.sol` | Roles `ADMIN, GOVT_OFFICIAL, AUDITOR, CONTRACTOR, RELAYER`; ward/department scoping; `Pausable` |
| `ProjectRegistry` | `ProjectRegistry.sol` | **C-1** `onlyEscrow` on `addSpentAmount` / `incrementMilestoneCount`; **M-1** close only when all milestones settled; **M-3** `metaHash` + `metaCID` instead of strings; per-project `approvalThreshold`; packed struct (§7.3) |
| `MilestoneEscrow` | `MilestoneEscrow.sol` | **C-2** only assigned contractor submits proof; **H-1** fund only ACTIVE projects + `refundUnallocated`; **H-2** require ACTIVE for approve/release; **H-3** cumulative `allocated` ≤ `escrowBalance`; **H-4** M-of-N (default 2); **M-2** bounded approvers; ledger vs escrow mode flag (§7.4) |
| `GrievanceRegistry` | new | `fileGrievance(projectId, cid, category, citizenHash)`, `upvote`, `respond(id, responseCID, action)`, `GrievanceThresholdReached` |
| `TenderRegistry` | new | publish, sealed-bid commit/reveal, `award` → `assignContractor` |
| `TrustedForwarder` | OZ `ERC2771Forwarder` | gasless citizen actions |

- [ ] OpenZeppelin v5, custom errors, NatSpec on every external fn, `ReentrancyGuard` on value-moving fns.
- [ ] Every event carries `indexed projectId` (+ `indexed actor`) and the CID/hash so the indexer never needs an extra `eth_call`.
- [ ] State machines exactly as §7.2 (project + milestone).
- [ ] UUPS proxies for Registry / Escrow / Grievance / Tender; `upgradeTo` gated by ADMIN → `NammaSevaMultisig` + 48 h `TimelockController` (no Safe on MST — ADR 0006).

## 3. Tests
- [ ] `test/DecentraliTrack.test.js` → `test/NammaSeva.test.ts`.
- [ ] One **regression test per §3.2 defect** that would fail on the old contracts.
- [ ] Every function, revert, event and role check; ≥ 95 % line coverage, 100 % state transitions.
- [ ] Foundry invariants: `sum(paid) ≤ sum(funded)`, `spent == sum(paid milestones)`, `allocated ≤ escrowBalance`.
- [ ] Upgrade storage-layout validation via `hardhat-upgrades`.
- [ ] Gas snapshot vs §7.6 targets (`createProject` < 180k, `submitProof` < 110k, …).
- [ ] Slither + Aderyn clean (no High).

## 4. Deploy to MST testnet
- [ ] `scripts/deploy.ts`: `Access → Forwarder → Registry(proxy) → Escrow(proxy) → Grievance(proxy) → Tender(proxy)`, then `registry.setEscrow`, `tender.setRegistry`.
- [ ] Writes `deployments/mstTestnet.json` (`chainId`, `blockNumber` = indexer start block, git `commit`, addresses).
- [ ] `scripts/grantRoles.ts` reads `config/roles.mstTestnet.json` — **no hard-coded Hardhat accounts** (L-1).
- [ ] `scripts/verify.ts` verifies implementations + proxies on testnet.mstscan.com.
- [ ] `scripts/exportAbis.ts` → `packages/chain/abis` + `deployments` + typed contract helpers (replaces `findArtifactsBase()` and duplicated ABI JSON).
- [ ] `scripts/smokeTest.ts` (from `verifyOnChain.js`): runs the §5.2 happy path and prints mstscan links.

## Deliverables
- 6 contracts, deployed + verified on MST testnet.
- `packages/chain` populated with ABIs + addresses.
- Smoke-test transcript with mstscan links (use in the demo).

## Exit criteria
- [ ] Full lifecycle (create → 2-of-3 approve → fund → milestone → proof → 2 approvals → release → grievance) executed on MST testnet and visible on testnet.mstscan.com.
- [ ] Coverage ≥ 95 %, Slither clean, all §3.2 regression tests green.
