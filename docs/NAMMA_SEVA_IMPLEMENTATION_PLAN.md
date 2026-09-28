# Namma Seva — Implementation Plan

> **ನಮ್ಮ ಸೇವೆ · நம்ம சேவை · "Our Service"**
> Blockchain-backed public infrastructure accountability, migrated from **DecentraliTrack (Polygon Amoy)** to **MST Blockchain**.

| | |
|---|---|
| **Document version** | 1.0 |
| **Date** | 28 September 2026 |
| **Base codebase** | `DecentraliTrack/` (pnpm monorepo: `artifacts/api-server`, `artifacts/decentralitrack`, `decentralitrack/contracts`, `lib/*`) |
| **Target chain** | MST Blockchain (EVM-compatible L1, PoSA consensus) — testnet first, then mainnet |
| **Developer reference** | https://docs.mstblockchain.com/developer-docs |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals, Non-Goals & Success Metrics](#2-goals-non-goals--success-metrics)
3. [Current State Audit (DecentraliTrack)](#3-current-state-audit-decentralitrack)
4. [MST Blockchain — Network Reference](#4-mst-blockchain--network-reference)
5. [Target Architecture](#5-target-architecture)
6. [Rebranding: DecentraliTrack → Namma Seva](#6-rebranding-decentralitrack--namma-seva)
7. [Smart Contracts v2](#7-smart-contracts-v2)
8. [Hardhat Setup, Deployment & Verification on MST](#8-hardhat-setup-deployment--verification-on-mst)
9. [Backend (API Server) Changes](#9-backend-api-server-changes)
10. [Authentication & Identity](#10-authentication--identity)
11. [Frontend Changes](#11-frontend-changes)
12. [Database Schema](#12-database-schema)
13. [Proof Integrity: IPFS, GPS & Media](#13-proof-integrity-ipfs-gps--media)
14. [Anomaly Detection v2](#14-anomaly-detection-v2)
15. [Citizen Grievance Module](#15-citizen-grievance-module)
16. [Security, Key Management & Compliance](#16-security-key-management--compliance)
17. [Testing Strategy](#17-testing-strategy)
18. [DevOps, CI/CD & Environments](#18-devops-cicd--environments)
19. [Phased Roadmap & Task Checklist](#19-phased-roadmap--task-checklist)
20. [Risks & Mitigations](#20-risks--mitigations)
21. [Open Questions to Confirm in MST Docs](#21-open-questions-to-confirm-in-mst-docs)
22. [Appendices](#22-appendices)

---

## 1. Executive Summary

**Namma Seva** lets citizens see, verify and question how public money is spent on local infrastructure (roads, drains, water supply, street lights, parks, buildings). Every project, milestone, proof photo, approval and payment is anchored on **MST Blockchain**, so records cannot be silently edited or deleted.

The existing DecentraliTrack MVP already has the core loop working (project → auditor approval → milestone escrow → contractor GPS/IPFS proof → auditor approval → payment release) on Polygon Amoy. This plan:

1. **Moves the chain layer to MST Blockchain** (testnet `91562037`, mainnet `4646`).
2. **Rebrands** the product to **Namma Seva** with multilingual (Kannada / Tamil / Hindi / English) citizen UX.
3. **Hardens the contracts** — the audit below found access-control holes that must be fixed before any real deployment.
4. **Replaces demo-grade auth and server-held private keys** with wallet sign-in (SIWE), per-user signing, and a managed relayer for citizens without wallets.
5. **Adds production features**: on-chain grievances, tender registry, reorg-safe indexing, stronger anomaly detection, DPDP-Act-compliant data handling, CI/CD and monitoring.

Estimated delivery: **10 weeks** across 6 phases (Section 19), with a working MST testnet demo by end of **Week 3**.

---

## 2. Goals, Non-Goals & Success Metrics

### 2.1 Goals
- G1 — All state-changing actions (project, milestone, proof, approval, release, grievance) are recorded as MST transactions and visible on **mstscan**.
- G2 — Any citizen can verify a project in < 3 taps, in their language, without a crypto wallet.
- G3 — No single actor (including the platform operator) can move escrow funds or alter history unilaterally.
- G4 — Backend is a *cache* of the chain, never the source of truth; it can be rebuilt from chain events at any time.
- G5 — Deployable to MST mainnet with verified contracts, audited code and documented runbooks.

### 2.2 Non-Goals (this release)
- Moving real INR on-chain (Namma Seva records INR amounts; real disbursement stays on PFMS/treasury rails — see §7.4).
- Aadhaar eKYC integration (needs UIDAI licensing; phone OTP is used instead).
- Native mobile apps (a PWA is delivered instead).

### 2.3 Success Metrics
| Metric | Target |
|---|---|
| Contract test coverage | ≥ 95 % lines, 100 % of state transitions |
| Chain → UI latency (event to dashboard) | ≤ 10 s (≈ 3 blocks at ~3 s block time) |
| Indexer rebuild from genesis block | Deterministic, matches DB checksum |
| Citizen page Lighthouse (mobile) | Performance ≥ 85, Accessibility ≥ 95 |
| Critical/High audit findings open at mainnet | 0 |

---

## 3. Current State Audit (DecentraliTrack)

### 3.1 What already exists and is reusable
| Area | Location | Reuse? |
|---|---|---|
| Contracts: `RoleManager`, `ProjectRegistry`, `MilestoneEscrow` | `decentralitrack/contracts/contracts/` | ✅ Refactor (see §7) |
| Hardhat project, deploy + verify scripts, tests | `decentralitrack/contracts/` | ✅ Retarget to MST |
| Express 5 + TypeScript API | `artifacts/api-server/src` | ✅ Keep structure |
| ethers v6 contract service / listener | `services/contractService.ts`, `blockchainListener.ts`, `blockchainConfig.ts` | ✅ Rework for MST |
| Anomaly engine | `services/anomalyEngine.ts` | ✅ Extend |
| IPFS via Pinata | `services/ipfsService.ts` | ✅ Harden |
| Socket.IO live updates | `socket/server.ts`, `hooks/use-live-updates.ts` | ✅ Keep |
| React 18 + Vite + shadcn UI, role dashboards | `artifacts/decentralitrack/src/pages` | ✅ Rebrand + extend |
| OpenAPI spec + generated client/zod | `lib/api-spec`, `lib/api-client-react`, `lib/api-zod` | ✅ Keep as contract-first API |
| Drizzle DB package | `lib/db` | ⚠️ Schema is empty — must be written (§12) |
| Docker / Nginx | `Dockerfile.*`, `docker-compose.yml`, `nginx.conf` | ✅ Update env + names |
| Legacy `decentralitrack/backend` (Mongo) + empty `frontend/src` | `decentralitrack/` | ❌ Delete — superseded by `artifacts/*` |
| `bricklayer/`, `.local/`, `.replit*` | root | ❌ Remove from repo / `.gitignore` |

### 3.2 Defects found that must be fixed

| # | Severity | Where | Issue | Fix |
|---|---|---|---|---|
| C-1 | **Critical** | `ProjectRegistry.incrementMilestoneCount`, `addSpentAmount` | `external` with **no access control** — anyone can inflate a project's spent amount / milestone count and corrupt the public record. | Restrict to the escrow contract address (`onlyEscrow`) set once at deploy. |
| C-2 | **Critical** | `MilestoneEscrow.submitProof` | Any address can submit proof for any milestone. | Require `msg.sender == project.contractorAddress` (or approved sub-contractor). |
| H-1 | High | `MilestoneEscrow.fundProject` | Funds can be sent to non-existent / cancelled projects; no refund path — funds stuck forever. | Check project exists & ACTIVE; add `refundUnallocated()` on CANCELLED/COMPLETED to treasury. |
| H-2 | High | `approveMilestone` / `releaseFunds` | Work continues while project is `PAUSED` (README claims it's blocked, contract doesn't enforce). | `require(project.status == ACTIVE)`. |
| H-3 | High | `createMilestone` | Sum of milestone payments can exceed escrow (each is checked alone, not cumulatively). | Track `allocated[projectId]`; require `allocated + amount <= balance`. |
| H-4 | High | `APPROVAL_THRESHOLD = 1` | One auditor alone can approve payment. | Configurable M-of-N threshold per project (default 2). |
| H-5 | High | Backend | Server holds private keys for *every* role (`PRIVKEY_GOVT_OFFICIAL`, `PRIVKEY_AUDITOR`, …) — the platform can impersonate auditors. | Users sign their own tx (wallet); server key only for relayer/meta-tx. |
| M-1 | Medium | `closeProject` | Can close with unpaid/unresolved milestones. | Require all milestones `PAID` or explicitly cancelled. |
| M-2 | Medium | `rejectMilestone` loop | Unbounded loop over approvers (gas DoS in theory). | Bound approvers (≤ N auditors) or use epoch counter. |
| M-3 | Medium | Strings on-chain | Titles/descriptions stored fully on-chain = high gas, PII risk. | Store `bytes32 metadataHash` + IPFS CID; full text off-chain. |
| M-4 | Medium | Solidity 0.8.20 default EVM = `shanghai` (`PUSH0`) | If MST (PoSA, BSC-style) hasn't activated Shanghai, deployment fails. | Set `evmVersion: "paris"` until MST docs confirm (see §21). |
| L-1 | Low | Deploy script | Hard-codes Hardhat default accounts as real roles. | Read role addresses from a per-network JSON config. |
| L-2 | Low | Listener | Uses live `contract.on()` subscriptions — misses events after downtime; no reorg handling. | Block-range `getLogs` indexer with cursor + confirmations (§9.3). |

---

## 4. MST Blockchain — Network Reference

> ⚠️ The developer docs site blocks automated fetching, so the values below were taken from the public **ethereum-lists/chains** registry (the source behind ChainList) and the MST website. **Cross-check every value against https://docs.mstblockchain.com/developer-docs before mainnet.**

| Property | MST Testnet | MST Mainnet |
|---|---|---|
| Chain ID | **91562037** (`0x5752035`) | **4646** (`0x1226`) |
| Native coin | tMSTC (18 decimals) | MSTC (18 decimals) |
| HTTPS RPC | `https://testnetrpc.mstblockchain.com` | `https://mariorpc.mstblockchain.com`, `https://craftrpc.mstblockchain.com` |
| WSS RPC | `wss://testnetrpc.mstblockchain.com` | `wss://mariorpc.mstblockchain.com`, `wss://craftrpc.mstblockchain.com` |
| Explorer | https://testnet.mstscan.com (Blockscout) | https://mstscan.com |
| Faucet | https://faucet.mstblockchain.com | — |

**Chain characteristics (from MST site):** Proof of Staked Authority (PoSA — PoA + DPoS), ~3 s block time, 4000+ TPS claimed, ~0.001 MSTC average fee, full EVM compatibility (Solidity, Hardhat, MetaMask). Native wallet: **BridgeKey** (multi-chain). Explorer is **Blockscout**, so standard Blockscout verification & REST APIs apply.

**Implications for Namma Seva**
- Low, predictable fees → it is affordable for the platform to **sponsor citizen transactions** (grievances, upvotes) via a relayer.
- ~3 s blocks → use **~6 confirmations (~18 s)** before treating an event as final in the UI ("Confirmed"); show "Pending" before that.
- Two mainnet RPCs → configure **ethers `FallbackProvider`** with both for resilience.
- PoSA has a small validator set → document this trust assumption on the public "How it works" page.

---

## 5. Target Architecture

```mermaid
flowchart LR
  subgraph Clients
    C[Citizen PWA<br/>no wallet needed]
    O[Official / Auditor / Contractor<br/>MetaMask or BridgeKey]
  end

  subgraph Backend["Namma Seva API (Express + TS)"]
    A[REST / OpenAPI]
    AUTH[SIWE + OTP Auth]
    R[Relayer<br/>ERC-2771 Forwarder]
    IDX[Chain Indexer<br/>getLogs + cursor]
    AN[Anomaly Engine]
    WS[Socket.IO]
    IPFS[IPFS Service]
  end

  subgraph Data
    PG[(PostgreSQL<br/>Drizzle)]
    RD[(Redis<br/>queues, rate-limit)]
    PIN[(IPFS / Pinata)]
  end

  subgraph MST["MST Blockchain (PoSA, EVM)"]
    AC[NammaSevaAccess]
    PR[ProjectRegistry]
    ME[MilestoneEscrow]
    GR[GrievanceRegistry]
    TR[TenderRegistry]
    FW[TrustedForwarder]
  end

  C -->|HTTPS| A
  O -->|signs tx directly| MST
  O -->|HTTPS| A
  A --> AUTH
  A --> IPFS --> PIN
  A --> R -->|meta-tx| FW --> GR
  IDX -->|eth_getLogs| MST
  IDX --> PG
  IDX --> WS --> C
  IDX --> WS --> O
  AN --> PG
  A --> PG
  A --> RD
```

### 5.1 Principles
- **Chain = source of truth; Postgres = indexed read model.** All writes go to chain; the DB is populated only by the indexer (plus off-chain-only data such as OTP sessions, images, translations).
- **Users sign their own privileged actions.** Officials/auditors/contractors use a wallet; the server never holds their keys.
- **Citizens are gasless.** Grievances/upvotes go through an ERC-2771 forwarder paid by the relayer wallet, rate-limited per verified phone number.
- **Everything on-chain is minimal & hashed.** Large text, images and PII live off-chain; the chain stores CIDs and `keccak256` hashes that prove integrity.

### 5.2 End-to-end flow (happy path)

```mermaid
sequenceDiagram
  participant OF as Official (wallet)
  participant AU as Auditors (2-of-3)
  participant CO as Contractor (wallet)
  participant PR as ProjectRegistry
  participant ME as MilestoneEscrow
  participant IX as Indexer/API
  participant CI as Citizen

  OF->>PR: createProject(metaCID, budget, ward, ...)
  PR-->>IX: ProjectCreated
  AU->>PR: approveProject(id)
  PR-->>IX: ProjectApproved (ACTIVE)
  OF->>ME: fundProject(id) / recordSanction(id, amountPaise)
  OF->>ME: createMilestone(id, metaCID, amount)
  CO->>IX: upload photos (EXIF GPS) → IPFS CID
  CO->>ME: submitProof(mId, proofCID, lat, lng, contentHash)
  AU->>ME: approveMilestone(mId) x2
  OF->>ME: releaseFunds(mId)
  ME-->>IX: FundsReleased
  IX-->>CI: live update + mstscan link
  CI->>IX: raise grievance (OTP) → relayer → GrievanceRegistry
```

---

## 6. Rebranding: DecentraliTrack → Namma Seva

### 6.1 Naming conventions
| Thing | Old | New |
|---|---|---|
| Product name | DecentraliTrack | **Namma Seva** |
| Package scope | `@workspace/decentralitrack` | `@namma-seva/web` |
| API package | `@workspace/api-server` | `@namma-seva/api` |
| Contracts folder | `decentralitrack/contracts` | `packages/contracts` |
| Frontend folder | `artifacts/decentralitrack` | `apps/web` |
| API folder | `artifacts/api-server` | `apps/api` |
| DB name/user | `decentralitrack` / `dt_user` | `nammaseva` / `ns_user` |
| Docker services | `decentralitrack-*` | `namma-seva-*` |
| Env prefix (frontend) | `VITE_*` | `VITE_NS_*` |
| Test file | `DecentraliTrack.test.js` | `NammaSeva.test.ts` |

### 6.2 Proposed repository layout
```
namma-seva/
├── apps/
│   ├── api/                 # was artifacts/api-server
│   └── web/                 # was artifacts/decentralitrack (PWA)
├── packages/
│   ├── contracts/           # was decentralitrack/contracts (Hardhat, TS)
│   ├── db/                  # was lib/db (Drizzle schema + migrations)
│   ├── api-spec/            # was lib/api-spec (OpenAPI)
│   ├── api-client/          # was lib/api-client-react
│   ├── api-zod/             # was lib/api-zod
│   ├── chain/               # NEW: MST chain config, ABIs, typed contracts (shared)
│   └── i18n/                # NEW: kn / ta / hi / en strings
├── infra/
│   ├── docker/              # Dockerfile.api, Dockerfile.web, nginx.conf
│   └── compose/             # docker-compose.{dev,prod}.yml
├── docs/
│   ├── NAMMA_SEVA_IMPLEMENTATION_PLAN.md
│   ├── runbooks/
│   └── adr/                 # architecture decision records
├── .github/workflows/
└── pnpm-workspace.yaml
```

### 6.3 Rebrand tasks
- [ ] Global rename (code identifiers, README, page titles, meta tags, OG images, favicon, `index.html`).
- [ ] New logo + palette (suggest civic saffron/teal; ensure WCAG AA contrast).
- [ ] Tagline: *"Every rupee, on-chain. Every citizen, informed."* (+ kn/ta/hi translations).
- [ ] Update Socket.IO namespace, localStorage keys, cookie names (`ns_session`).
- [ ] Remove Replit-specific plugins (`@replit/vite-plugin-*`), `.replit`, `replit.md`, `.local/`, `bricklayer/`, legacy `decentralitrack/backend`.
- [ ] Update Docker image names, compose project name, Nginx `server_name`.

---

## 7. Smart Contracts v2

### 7.1 Contract set

| Contract | Responsibility | New/Changed |
|---|---|---|
| `NammaSevaAccess` | Roles: `ADMIN`, `GOVT_OFFICIAL`, `AUDITOR`, `CONTRACTOR`, `RELAYER`; per-ward/department scoping; pausable. | Refactor of `RoleManager` |
| `ProjectRegistry` | Project lifecycle, metadata CID, ward/department, contractor assignment, M-of-N threshold config. | Fix C-1, M-1, M-3 |
| `MilestoneEscrow` | Sanction/escrow accounting, milestone lifecycle, proofs, multi-auditor approval, release, refunds. | Fix C-2, H-1..H-4, M-2 |
| `GrievanceRegistry` | Citizen complaints (hash + CID), upvotes, auditor responses, auto-flag thresholds. | **New** |
| `TenderRegistry` | Tender publish, sealed-bid commit/reveal (hash), award → `assignContractor`. | **New** (existing `tenders.ts` route is off-chain only) |
| `TrustedForwarder` | ERC-2771 meta-transactions for gasless citizens. | **New** (OpenZeppelin `ERC2771Forwarder`) |

All contracts: Solidity `0.8.24` (pinned), OpenZeppelin **v5**, `evmVersion: "paris"` until Shanghai/Cancun support on MST is confirmed, custom errors instead of revert strings, NatSpec on every external function.

### 7.2 State machines

```mermaid
stateDiagram-v2
  [*] --> PENDING_APPROVAL
  PENDING_APPROVAL --> ACTIVE: approveProject (M-of-N auditors)
  PENDING_APPROVAL --> CANCELLED: rejectProject
  ACTIVE --> PAUSED: pauseProject / grievance threshold
  PAUSED --> ACTIVE: resumeProject
  ACTIVE --> COMPLETED: closeProject (all milestones settled)
  ACTIVE --> CANCELLED: cancelProject (official + auditor)
  COMPLETED --> [*]
  CANCELLED --> [*]
```

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> PROOF_SUBMITTED: submitProof (assigned contractor only)
  PROOF_SUBMITTED --> APPROVED: approvals >= threshold
  PROOF_SUBMITTED --> REJECTED: rejectMilestone
  REJECTED --> PROOF_SUBMITTED: resubmit
  APPROVED --> PAID: releaseFunds (project ACTIVE)
  PENDING --> VOID: cancelMilestone (refund allocation)
```

### 7.3 Key code changes (illustrative)

**Fix C-1 — lock down registry mutators**
```solidity
address public escrow;               // set once
error OnlyEscrow();
error EscrowAlreadySet();

function setEscrow(address e) external onlyRole(ADMIN) {
    if (escrow != address(0)) revert EscrowAlreadySet();
    escrow = e;
}
modifier onlyEscrow() { if (msg.sender != escrow) revert OnlyEscrow(); _; }

function addSpentAmount(uint256 id, uint256 amt) external onlyEscrow { ... }
function incrementMilestoneCount(uint256 id) external onlyEscrow { ... }
```

**Fix C-2, H-2 — only the assigned contractor, only while ACTIVE**
```solidity
function submitProof(uint256 mId, string calldata cid, bytes32 contentHash,
                     int32 latE6, int32 lngE6) external {
    Milestone storage m = _milestone(mId);
    Project memory p = registry.getProject(m.projectId);
    if (p.status != Status.ACTIVE) revert ProjectNotActive();
    if (_msgSender() != p.contractor) revert NotAssignedContractor();
    ...
}
```

**Fix H-3 — cumulative allocation**
```solidity
mapping(uint256 => uint256) public escrowBalance;  // funded
mapping(uint256 => uint256) public allocated;      // committed to milestones

if (allocated[pid] + amount > escrowBalance[pid]) revert InsufficientEscrow();
allocated[pid] += amount;
```

**Fix H-4 — M-of-N approval**
```solidity
struct Project { ... uint8 approvalThreshold; }  // default 2, min 1, max #auditors
if (m.approvalCount >= p.approvalThreshold) m.status = MStatus.APPROVED;
```

**Fix M-3 — minimal on-chain data**
```solidity
struct Project {
    uint64  id;
    bytes32 metaHash;        // keccak256 of canonical JSON
    string  metaCID;         // IPFS CID of title/description/location/photos
    uint32  wardId;          // e.g. BBMP ward number
    uint16  departmentId;
    int32   latE6; int32 lngE6;   // micro-degrees, packed
    uint128 budgetPaise;     // INR in paise
    uint128 spentPaise;
    uint64  startDate; uint64 endDate;
    address official; address contractor;
    Status  status; Category category;
    uint8   approvalThreshold; uint16 milestoneCount;
}
```

**Events** — every event includes `indexed projectId` and, where relevant, `indexed actor`, plus the CID/hash so the indexer never needs a follow-up `eth_call`.

### 7.4 Funding model (important decision)

Real government money moves through PFMS/treasury, not a blockchain. Support two modes behind one interface:

| Mode | How | Use |
|---|---|---|
| **A. Ledger mode (default, production)** | Amounts stored in **INR paise**. `recordSanction`, `recordRelease(mId, utrRefHash)` log the bank UTR/PFMS reference hash on-chain. No crypto moves. | Real deployments |
| **B. Escrow mode (demo / pilot)** | Native **MSTC** (or an MST-20/ERC-20 test "₹-token") actually locked in `MilestoneEscrow` and paid out on release. | Hackathon demo, grants, CSR-funded pilots |

Mode is a constructor flag; both emit the same events so the UI is identical.

### 7.5 Upgradeability
- Use **UUPS proxies** (OpenZeppelin `UUPSUpgradeable`) for `ProjectRegistry`, `MilestoneEscrow`, `GrievanceRegistry`, `TenderRegistry`.
- `upgradeTo` gated by `ADMIN` held in a **multisig** (Safe, if deployed on MST — see §21; otherwise a simple on-chain M-of-N `NammaSevaMultisig`) + **48 h timelock** (`TimelockController`).
- Storage-layout checks via `@openzeppelin/hardhat-upgrades` in CI.

### 7.6 Gas & storage budget (targets to validate on testnet)
| Call | Target gas |
|---|---|
| `createProject` | < 180k |
| `createMilestone` | < 120k |
| `submitProof` | < 110k |
| `approveMilestone` | < 70k |
| `releaseFunds` | < 90k |
| `fileGrievance` (via forwarder) | < 100k |

At ~0.001 MSTC per typical tx, a ward with 200 projects × 10 actions ≈ 2 MSTC/year — negligible; budget the relayer wallet with a monthly top-up alert.

---

## 8. Hardhat Setup, Deployment & Verification on MST

### 8.1 `packages/contracts/hardhat.config.ts`
```ts
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";
dotenv.config();

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

export default {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "paris",          // switch to "shanghai"/"cancun" once MST confirms support
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    mstTestnet: {
      url: process.env.MST_TESTNET_RPC ?? "https://testnetrpc.mstblockchain.com",
      chainId: 91562037,
      accounts,
    },
    mstMainnet: {
      url: process.env.MST_MAINNET_RPC ?? "https://mariorpc.mstblockchain.com",
      chainId: 4646,
      accounts,
    },
  },
  etherscan: {
    // Blockscout accepts any non-empty key
    apiKey: { mstTestnet: "blockscout", mstMainnet: "blockscout" },
    customChains: [
      {
        network: "mstTestnet",
        chainId: 91562037,
        urls: { apiURL: "https://testnet.mstscan.com/api", browserURL: "https://testnet.mstscan.com" },
      },
      {
        network: "mstMainnet",
        chainId: 4646,
        urls: { apiURL: "https://mstscan.com/api", browserURL: "https://mstscan.com" },
      },
    ],
  },
  sourcify: { enabled: false },
  gasReporter: { enabled: !!process.env.REPORT_GAS, currency: "INR" },
};
```

### 8.2 Scripts (`package.json`)
```json
{
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "coverage": "hardhat coverage",
    "node": "hardhat node",
    "deploy:local": "hardhat run scripts/deploy.ts --network localhost",
    "deploy:mst-testnet": "hardhat run scripts/deploy.ts --network mstTestnet",
    "deploy:mst-mainnet": "hardhat run scripts/deploy.ts --network mstMainnet",
    "verify:mst-testnet": "hardhat run scripts/verify.ts --network mstTestnet",
    "roles:mst-testnet": "hardhat run scripts/grantRoles.ts --network mstTestnet",
    "export-abis": "hardhat run scripts/exportAbis.ts"
  }
}
```

### 8.3 Deployment procedure (testnet)
1. Create a fresh deployer wallet (never reuse a Hardhat default key). Add MST Testnet to MetaMask/BridgeKey (Appendix B).
2. Get tMSTC from https://faucet.mstblockchain.com for: deployer, relayer, 2 officials, 3 auditors, 2 contractors.
3. `pnpm --filter contracts deploy:mst-testnet` → deploys in order:
   `NammaSevaAccess → TrustedForwarder → ProjectRegistry (proxy) → MilestoneEscrow (proxy) → GrievanceRegistry (proxy) → TenderRegistry (proxy)` then `registry.setEscrow(escrow)`, `tender.setRegistry(...)`.
4. Script writes `deployments/mstTestnet.json`:
   ```json
   { "chainId": 91562037, "blockNumber": 123456, "commit": "<git sha>",
     "contracts": { "NammaSevaAccess": "0x…", "ProjectRegistry": "0x…", "...": "0x…" } }
   ```
   `blockNumber` = **indexer start block**.
5. `pnpm --filter contracts roles:mst-testnet` → grants roles from `config/roles.mstTestnet.json` (addresses per ward/department).
6. `pnpm --filter contracts verify:mst-testnet` → verifies all implementations + proxies on testnet.mstscan.com.
7. `pnpm --filter contracts export-abis` → writes typed ABIs + addresses to `packages/chain` (consumed by API and web — removes the current fragile `findArtifactsBase()` path lookup and the duplicated `src/abis/*.json`).
8. Smoke test script runs the full happy path on testnet and prints mstscan links.

### 8.4 Mainnet procedure (additional gates)
- [ ] External audit complete, all Critical/High fixed.
- [ ] Deployer = hardware wallet; `ADMIN` immediately transferred to multisig + timelock; deployer renounces.
- [ ] Contracts verified on mstscan.com; addresses published on the Namma Seva "Transparency" page and in the repo.
- [ ] Relayer wallet funded with a hard daily spend cap.
- [ ] Runbook rehearsed on testnet (upgrade, pause, role rotation, relayer key rotation).

---

## 9. Backend (API Server) Changes

### 9.1 Chain configuration (`packages/chain/src/networks.ts`)
```ts
export const MST_TESTNET = {
  id: 91562037,
  name: "MST Testnet",
  nativeCurrency: { name: "MST Native Coin", symbol: "tMSTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnetrpc.mstblockchain.com"],
                        webSocket: ["wss://testnetrpc.mstblockchain.com"] } },
  blockExplorers: { default: { name: "mstscan", url: "https://testnet.mstscan.com" } },
  testnet: true,
} as const;

export const MST_MAINNET = {
  id: 4646,
  name: "MST Mainnet",
  nativeCurrency: { name: "MST Native Coin", symbol: "MSTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://mariorpc.mstblockchain.com", "https://craftrpc.mstblockchain.com"],
                        webSocket: ["wss://mariorpc.mstblockchain.com"] } },
  blockExplorers: { default: { name: "mstscan", url: "https://mstscan.com" } },
} as const;
```

### 9.2 `blockchainConfig.ts` rewrite
- Replace `HARDHAT_RPC_URL ?? POLYGON_AMOY_RPC ?? localhost` with `NS_CHAIN=mstTestnet|mstMainnet|local` + `MST_RPC_URLS` (comma-separated).
- Use `ethers.FallbackProvider` over all RPC URLs (quorum 1, stall timeout 2 s).
- **Startup guard:** `provider.getNetwork()` must equal the expected chain ID, else refuse to boot.
- Load addresses from `packages/chain/deployments/<network>.json`, not scattered env vars.
- Remove per-role private keys. Only `RELAYER_PRIVATE_KEY` remains (ideally from KMS/Vault, §16).

### 9.3 Indexer (replaces `blockchainListener.ts`)
Reliable, restartable, reorg-aware:

```
loop every 3 s:
  head      = provider.getBlockNumber()
  safeHead  = head - CONFIRMATIONS            # default 6 (~18 s)
  from      = cursor.lastIndexedBlock + 1
  to        = min(from + BATCH(2000) - 1, safeHead)
  logs      = provider.getLogs({ address: [all contracts], fromBlock: from, toBlock: to })
  BEGIN TX
    for log in logs (ordered by block, logIndex):
       upsert chain_events (tx_hash, log_index) UNIQUE   # idempotent
       apply projection (projects / milestones / grievances / tenders)
    cursor.lastIndexedBlock = to; cursor.lastBlockHash = block(to).hash
  COMMIT
  publish Socket.IO events for affected entities
```
- Separately track `head` (unconfirmed) events for "Pending" UI badges.
- Reorg check: on each loop confirm stored `lastBlockHash` still matches; if not, roll back projections to `lastIndexedBlock - REORG_DEPTH` and re-index.
- CLI: `pnpm --filter api indexer:rebuild --from <deployBlock>` truncates projections and replays — proves G4.
- If MST RPC limits `eth_getLogs` ranges, make `BATCH` adaptive (halve on error).

### 9.4 Write path
Two options, both supported:

| Actor | How tx is sent |
|---|---|
| Official / Auditor / Contractor | **Frontend signs & sends** directly via wallet. API only receives `txHash` for optimistic UI, then the indexer confirms. |
| Citizen (no wallet) | API builds an **EIP-712 ForwardRequest** signed by a server-custodied *per-citizen* key (derived, never exposed) or by the relayer on their behalf, sent through `TrustedForwarder`. Rate-limited by verified phone. |

Relayer details:
- Nonce manager (`ethers.NonceManager`) + Redis lock so concurrent requests don't collide.
- BullMQ queue for tx submission with retries, gas bump on stuck tx (replace-by-nonce after 60 s).
- Balance monitor → alert when relayer < 10 MSTC.

### 9.5 API routes (delta from current)

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/auth/siwe/nonce`, `/api/auth/siwe/verify` | **New** — wallet login |
| `POST` | `/api/auth/otp/send`, `/api/auth/otp/verify` | **New** — citizen login |
| `POST` | `/api/projects` | Now: validates + pins metadata to IPFS, returns `{metaCID, metaHash}` for the wallet to sign `createProject` |
| `POST` | `/api/tx/track` | **New** — client posts `txHash` for optimistic "pending" state |
| `POST` | `/api/milestones/:id/proof/upload` | Upload + EXIF/GPS validation → returns `proofCID, contentHash` |
| `POST` | `/api/grievances` | **New** — citizen grievance via relayer |
| `POST` | `/api/grievances/:id/upvote` | **New** |
| `GET` | `/api/grievances?projectId=` | **New** |
| `GET` | `/api/tenders`, `POST /api/tenders/:id/bid-commit` | Moved on-chain via `TenderRegistry` |
| `GET` | `/api/verify/:projectId` | **New** — returns DB record + live on-chain read + hash comparison ("Verified ✓") |
| `GET` | `/api/chain/status` | Network, head block, indexer lag, relayer balance |
| `GET` | `/api/public/export.csv` | **New** — open data export per ward |
| `DELETE` | `approve/reject/release` server-signed routes | **Removed** — these are wallet-signed now |

Update `lib/api-spec/openapi.yaml` first → regenerate `api-zod` and `api-client-react` with Orval (contract-first).

### 9.6 Cross-cutting
- `helmet`, CORS allow-list, `express-rate-limit` backed by Redis.
- Zod validation on every body (already generated from OpenAPI).
- Pino logs with `txHash`, `projectId`, `requestId`; ship to Loki/Grafana.
- Health: `/api/health` (liveness), `/api/ready` (DB + RPC + indexer lag < 60 s).

---

## 10. Authentication & Identity

| User | Method | Notes |
|---|---|---|
| Official, Auditor, Contractor | **Sign-In With Ethereum (EIP-4361)** via MetaMask or BridgeKey | Nonce from `/siwe/nonce`, message includes `chainId: 91562037/4646` and domain; server verifies signature and **reads role from `NammaSevaAccess` on-chain** (no role stored only in DB). JWT (15 min) + httpOnly refresh cookie. |
| Citizen | **Phone OTP** (MSG91 / Twilio / Gupshup) | No wallet required. Phone stored hashed (`sha256(phone + pepper)`) for rate-limit & dedupe; raw number encrypted at rest only if needed for SMS updates (opt-in). |
| Admin | SIWE + hardware wallet + IP allow-list | Admin UI actions that change roles are on-chain multisig proposals. |

Onboarding of officials/contractors: admin proposes `grantRole(addr, role, wardId)` → multisig approves → indexer updates DB → user can log in.

Remove: demo role cards with shared passwords (keep them only when `NS_DEMO_MODE=true`, clearly bannered "DEMO").

---

## 11. Frontend Changes

### 11.1 Web3 stack
- Add **wagmi v2 + viem** (or keep ethers v6 + a thin hook layer — pick one; wagmi recommended for wallet state).
- Define `mstTestnet`/`mstMainnet` with viem `defineChain` from `packages/chain`.
- Connectors: `injected` (MetaMask, BridgeKey browser extension), WalletConnect v2 (for BridgeKey mobile if it supports WC — verify §21).
- **Wrong-network guard:** banner + one-click `wallet_switchEthereumChain` → fallback `wallet_addEthereumChain` (Appendix B).
- Tx UX: `Sign in wallet → Pending (n/6 confirmations) → Confirmed ✓ [View on mstscan]`.
- Replace every `amoy.polygonscan.com` link with `VITE_NS_EXPLORER_URL` (`https://testnet.mstscan.com` / `https://mstscan.com`): `/tx/{hash}`, `/address/{addr}`, `/block/{n}`.

### 11.2 Pages
| Route | Audience | Changes |
|---|---|---|
| `/` | Everyone | Rebrand; ward selector; map (Leaflet + OSM) of projects; "How verification works" explainer |
| `/ward/:wardId` | Everyone | **New** — ward-level spend dashboard, open-data CSV |
| `/projects/:id` | Everyone | Timeline with on-chain badges, proof gallery (IPFS), grievances, **"Verify on chain"** button |
| `/verify` | Everyone | **New** — paste tx hash / project ID / scan QR → shows chain proof |
| `/citizen` | Citizen | OTP login, file grievance (photo + GPS), track my grievances |
| `/official` | Official | Wallet-signed create project/milestone/release; budget vs spent |
| `/contractor` | Contractor | Mobile-first proof capture (camera, GPS lock), offline queue |
| `/subcontractor*` | Sub-contractor | Keep existing confirm flow, route through `TenderRegistry`/escrow roles |
| `/auditor` | Auditor | Queue of proofs with map diff (proof GPS vs project GPS), anomaly panel, M-of-N status |
| `/tenders` | Everyone | **New/moved** — tender board, commit/reveal status |
| `/blockchain-log` | Everyone | Rename to `/ledger`; fed from indexer; filter by ward/contract/event |
| `/admin` | Admin | Role proposals, relayer balance, indexer lag, contract addresses |

### 11.3 Citizen experience
- **i18n:** `react-i18next` with **Kannada (kn), Tamil (ta), Hindi (hi), English (en)**; language picker on first load; numbers in Indian grouping (₹ 12,34,567).
- **PWA:** installable, offline cache of viewed projects, background sync for contractor proofs.
- **QR codes** on physical project signboards → `/projects/:id?src=board` (sign-board generator for officials, printable PDF).
- **Accessibility:** WCAG 2.1 AA, large touch targets, screen-reader labels, low-bandwidth mode (thumbnails only).
- **WhatsApp/SMS share** of project status.

---

## 12. Database Schema

The current `lib/db/src/schema/index.ts` is empty and the app runs on an in-memory store. Implement with **Drizzle + PostgreSQL 16**:

```
users                (id, wallet_address UNIQUE NULL, phone_hash UNIQUE NULL, role, ward_id, dept_id,
                      display_name, preferred_lang, created_at)
wards                (id, name_en, name_kn, name_ta, name_hi, city, geojson)
departments          (id, name, code)
projects             (id PK = chain id, meta_cid, meta_hash, title, description, category, ward_id,
                      dept_id, lat, lng, budget_paise, spent_paise, status, official_addr,
                      contractor_addr, approval_threshold, start_date, end_date,
                      created_tx, created_block, updated_block)
milestones           (id PK = chain id, project_id FK, title, meta_cid, amount_paise, status,
                      proof_cid, proof_hash, proof_lat, proof_lng, submitted_by, submitted_at,
                      approval_count, rejection_reason, paid_tx, updated_block)
milestone_approvals  (milestone_id, auditor_addr, tx_hash, block, PRIMARY KEY(milestone_id, auditor_addr))
grievances           (id PK = chain id, project_id, citizen_hash, category, cid, status, upvotes,
                      response_cid, created_tx, updated_block)
tenders              (id, project_id, status, commit_deadline, reveal_deadline, awarded_to, meta_cid)
bids                 (tender_id, bidder_addr, commit_hash, revealed_amount_paise, revealed_at)
proof_media          (id, milestone_id, cid, sha256, mime, width, height, exif_lat, exif_lng,
                      exif_time, gps_distance_m, flagged)
chain_events         (tx_hash, log_index, block_number, block_hash, contract, event_name, args JSONB,
                      confirmed BOOL, PRIMARY KEY(tx_hash, log_index))
indexer_cursor       (id, network, last_block, last_block_hash, updated_at)
pending_txs          (tx_hash PK, user_id, kind, entity_id, submitted_at, status)
anomalies            (id, project_id, rule, severity, details JSONB, detected_at, resolved_at)
otp_sessions         (phone_hash, code_hash, expires_at, attempts)
audit_log            (id, actor, action, entity, entity_id, request_id, ip_hash, at)
```

- Migrations via `drizzle-kit`; seed script for wards (start with one city, e.g. BBMP Bengaluru wards) and departments.
- Delete the in-memory store in `data.ts` except behind `NS_DEMO_MODE`.

---

## 13. Proof Integrity: IPFS, GPS & Media

1. Contractor captures photo in-app (camera only, gallery upload disabled in strict mode).
2. Client reads GPS from device + EXIF; server re-extracts EXIF with `exifr`.
3. Server checks:
   - EXIF GPS within **geofence** (default 250 m, per-category configurable) of project coordinates.
   - EXIF timestamp within ±48 h of upload; not older than the milestone creation.
   - Perceptual hash (`pHash`) not seen before in any other milestone (stops photo reuse).
4. Strip personal EXIF fields (device serial), keep GPS + time; generate thumbnail.
5. Pin image(s) + `proof.json` (`{milestoneId, images:[{cid,sha256}], lat, lng, capturedAt, checks}`) to IPFS (Pinata), with a second pinning service or self-hosted IPFS node for redundancy.
6. Return `proofCID` + `contentHash = keccak256(canonical proof.json)`; contractor's wallet calls `submitProof(...)`.
7. Auditor UI shows the check results; failed checks don't block submission but auto-create an anomaly.
8. Gateway: `VITE_NS_IPFS_GATEWAY` (Pinata dedicated gateway), with public fallback (`ipfs.io`, `dweb.link`).

---

## 14. Anomaly Detection v2

Extend `anomalyEngine.ts` (currently runs every 10 min on in-memory data) to run on Postgres + chain events:

| Rule | Signal | Severity |
|---|---|---|
| Budget overrun | `spent > budget` or milestone sum > budget | High |
| Stalled approval | `PENDING_APPROVAL` > 14 days | Medium |
| Stalled milestone | `PROOF_SUBMITTED` > 7 days without decision | Medium |
| Spending velocity | > 60 % budget released in < 20 % of timeline | High |
| GPS mismatch | Proof > geofence distance | High |
| Duplicate media | pHash match across milestones/projects | Critical |
| Same-actor collusion | Same auditor approves > 80 % of one contractor's milestones | Medium |
| Contractor concentration | One contractor > 40 % of ward budget in FY | Medium |
| Grievance spike | ≥ N unique citizens in 7 days | High → auto-suggest pause |
| Split tendering | Multiple projects just under tender threshold, same ward/category/month | High |
| Weekend/night approvals | Approvals outside working hours cluster | Low |

- Results written to `anomalies`; surfaced on auditor dashboard and public project page (public sees "Under review", not accusations).
- Optional: anchor a daily **Merkle root of anomalies** on-chain (`AnomalyAnchor`) so reports can't be retroactively altered.

---

## 15. Citizen Grievance Module

- Citizen (OTP-verified) files a grievance: category (quality, delay, safety, missing work, corruption), text, photo, GPS.
- Text/photo → IPFS; `fileGrievance(projectId, cid, categoryId, citizenHash)` via relayer + forwarder. `citizenHash` = salted hash of phone (no PII on-chain).
- Other citizens can **upvote** (one per verified phone per grievance).
- When unique upvotes ≥ threshold (e.g. 25) → `GrievanceThresholdReached` event → auditor must respond within SLA (7 days) via `respond(grievanceId, responseCID, action)`; action may be `PAUSE_PROJECT`.
- Public grievance status timeline; SLA breach becomes an anomaly.
- Abuse controls: 3 grievances/day/phone, CAPTCHA (hCaptcha), moderation queue for text (hate speech/PII) before IPFS pinning.

---

## 16. Security, Key Management & Compliance

### 16.1 Smart contract security
- Static analysis: **Slither**, **Aderyn** in CI; fail on High.
- Fuzz/invariant tests with **Foundry** (`forge test --fuzz-runs 10000`), e.g. invariants: `sum(paid) <= sum(funded)`, `spent == sum(paid milestones)`, `allocated <= escrowBalance`.
- Reentrancy guards on all value-moving functions; checks-effects-interactions.
- Emergency `pause()` (OpenZeppelin `Pausable`) held by multisig.
- External audit before mainnet (budget 2–3 weeks).

### 16.2 Keys
| Key | Storage |
|---|---|
| Deployer | Hardware wallet; unused after deploy |
| Admin / upgrade | Multisig (3-of-5: dept head, IT officer, independent auditor, civic-society rep, platform) + timelock |
| Relayer | Cloud KMS / HashiCorp Vault transit signer; daily spend cap; rotated quarterly |
| Officials/Auditors/Contractors | Their own wallets (MetaMask / BridgeKey / hardware) |

Remove all `PRIVKEY_*` env vars from `.env`, `.env.example`, Docker and CI. `.env` is already git-ignored (good) — keep it that way, and rotate any real keys that were ever shared in Replit or chat.

### 16.3 Application security
- OWASP ASVS L2 checklist; dependency scanning (`pnpm audit`, Dependabot, Socket.dev).
- CSP headers in Nginx; upload size/type limits; image re-encoding to kill malicious payloads.
- Secrets only via environment/secret manager; `.env` in `.gitignore`.

### 16.4 Legal & compliance (India)
- **Digital Personal Data Protection Act, 2023 (DPDP):** consent notice at OTP login (in user's language), purpose limitation, data-principal rights (access/erase for off-chain data), grievance officer contact. **No personal data on-chain** — only salted hashes and CIDs of moderated content — because on-chain data cannot be erased.
- **IT Act 2000 / CERT-In directions:** 6-hour incident reporting, log retention 180 days.
- **RTI alignment:** public data export makes suo-motu disclosure (Sec. 4 RTI Act) easier — mention in pitch.
- **GIGW 3.0** (Guidelines for Indian Government Websites) for any government-hosted deployment: accessibility, bilingual content.
- Obtain written MoU / pilot approval from the ULB (e.g. ward office) before using real project data.

---

## 17. Testing Strategy

| Layer | Tooling | Scope |
|---|---|---|
| Contracts – unit | Hardhat + Chai (TS) | Every function, every revert, every event, role checks |
| Contracts – fuzz/invariant | Foundry | Escrow accounting invariants, state machine |
| Contracts – upgrade | `hardhat-upgrades` validate | Storage layout across versions |
| Contracts – fork/integration | Scripted run on **MST testnet** | Full lifecycle, gas measurement, Blockscout verification |
| Indexer | Vitest + local Hardhat node | Idempotency, reorg simulation (`evm_revert`), rebuild equality |
| API | Vitest + Supertest + Testcontainers (Postgres, Redis) | Auth, validation, relayer queue |
| Frontend | Vitest + React Testing Library | Components, i18n keys present in all 4 languages |
| E2E | Playwright + Synpress (MetaMask) against Hardhat node | Official→Auditor→Contractor→Release, citizen grievance |
| Load | k6 | 500 concurrent citizen readers, 20 tx/min writes |
| Security | Slither, Aderyn, ZAP baseline scan | CI gates |
| Accessibility | axe-core in Playwright | WCAG AA |

Rewrite `DecentraliTrack.test.js` → `NammaSeva.test.ts`, adding explicit tests for every defect in §3.2 (regression tests that fail on the old code).

---

## 18. DevOps, CI/CD & Environments

### 18.1 Environments
| Env | Chain | DB | URL (example) |
|---|---|---|---|
| `local` | Hardhat node (31337) | Docker Postgres | localhost |
| `dev` | MST Testnet | Managed Postgres (dev) | dev.nammaseva.in |
| `staging` | MST Testnet (separate deployment) | Managed Postgres (staging) | staging.nammaseva.in |
| `prod` | MST Mainnet | Managed Postgres (HA) + PITR backups | nammaseva.in |

### 18.2 GitHub Actions
```
ci.yml       : install → lint → typecheck → contracts test+coverage → slither →
               api tests (testcontainers) → web build → playwright (hardhat)
deploy-dev.yml     : on main → build images → push GHCR → deploy (Railway/Render/Fly/VM)
deploy-contracts.yml : manual dispatch → network input → deploy → verify → commit deployments/*.json (PR)
```

### 18.3 Runtime
- Docker images: `namma-seva-api`, `namma-seva-indexer` (same image, different command), `namma-seva-web` (Nginx static).
- Compose adds **Redis**; API and indexer are separate processes (indexer as singleton with a Postgres advisory lock).
- Monitoring: Prometheus metrics (`indexer_lag_blocks`, `relayer_balance`, `tx_failures_total`, `rpc_latency_ms`), Grafana dashboards, alerts to Slack/Email.
- Backups: nightly Postgres dump + weekly restore test; the DB can also be rebuilt from chain.

---

## 19. Phased Roadmap & Task Checklist

```mermaid
gantt
  dateFormat  YYYY-MM-DD
  title Namma Seva — 10 week plan
  section Phase 0
  Setup & rebrand                 :p0, 2026-10-05, 5d
  section Phase 1
  Contracts v2 + MST testnet      :p1, after p0, 10d
  section Phase 2
  DB, indexer, API                :p2, after p1, 10d
  section Phase 3
  Frontend, wallets, i18n         :p3, 2026-10-26, 14d
  section Phase 4
  Grievance, tenders, anomalies   :p4, after p2, 10d
  section Phase 5
  Hardening, audit, pilot         :p5, 2026-11-23, 15d
```

### Phase 0 — Setup & Rebrand (Week 1)
- [ ] Create `namma-seva` repo (or branch `namma-seva`); restructure into `apps/`, `packages/`, `infra/`, `docs/` (§6.2).
- [ ] Remove legacy/unused: `decentralitrack/backend`, `decentralitrack/frontend`, `bricklayer/`, `.local/`, `.replit*`, `replit.md`, Replit Vite plugins.
- [ ] Rotate any real keys used during the hackathon; confirm `.env` stays git-ignored.
- [ ] Global rename to Namma Seva (§6.3); new logo/palette.
- [ ] Add MST Testnet to team wallets; fund from faucet.
- [ ] Read MST developer docs end-to-end and resolve §21 questions; record answers as ADRs.
- **Exit:** repo builds; README updated; team wallets on MST testnet.

### Phase 1 — Smart Contracts v2 on MST Testnet (Weeks 2–3)
- [ ] Hardhat → TypeScript; config for `mstTestnet`/`mstMainnet` (§8.1); `evmVersion` decided.
- [ ] Implement `NammaSevaAccess`, refactor `ProjectRegistry`, `MilestoneEscrow` with all §3.2 fixes.
- [ ] Implement `GrievanceRegistry`, `TenderRegistry`, `TrustedForwarder` integration (ERC-2771).
- [ ] UUPS proxies + timelock.
- [ ] Unit tests ≥ 95 %, Foundry invariants, Slither clean.
- [ ] Deploy + verify on MST testnet; generate `deployments/mstTestnet.json`; export ABIs to `packages/chain`.
- [ ] Testnet smoke script with mstscan links.
- **Exit:** full lifecycle executed on MST testnet and visible on testnet.mstscan.com. ✅ *Demo-able milestone.*

### Phase 2 — Database, Indexer & API (Weeks 4–5)
- [ ] Drizzle schema + migrations + seeds (§12).
- [ ] `blockchainConfig` rewrite (FallbackProvider, chain-ID guard) (§9.2).
- [ ] New indexer with cursor, confirmations, reorg handling, rebuild CLI (§9.3).
- [ ] SIWE + OTP auth (§10).
- [ ] Relayer with queue, nonce manager, balance alerts (§9.4).
- [ ] Update OpenAPI → regenerate zod/client; implement route deltas (§9.5).
- [ ] Remove server-held role keys and in-memory store (demo mode only).
- **Exit:** indexer rebuild matches live DB; API integration tests green.

### Phase 3 — Frontend, Wallets & i18n (Weeks 4–6, parallel)
- [ ] wagmi/viem with MST chains; connect MetaMask + BridgeKey; network switch/add.
- [ ] Wallet-signed flows for official/auditor/contractor with pending → confirmed UX.
- [ ] Explorer links → mstscan; `/verify`, `/ward/:id`, `/tenders`, `/ledger`.
- [ ] i18n kn/ta/hi/en; PWA; QR sign-board generator.
- [ ] Contractor mobile proof capture with GPS lock and offline queue.
- **Exit:** Playwright E2E happy path green against local chain and MST testnet.

### Phase 4 — Grievances, Tenders, Anomaly v2 (Weeks 6–7)
- [ ] Citizen grievance + upvote + SLA workflow (§15).
- [ ] Tender commit/reveal flow and award → contractor assignment.
- [ ] Media checks: geofence, EXIF time, pHash duplicates (§13).
- [ ] Anomaly rules v2 + auditor panel + optional on-chain anomaly anchor (§14).
- [ ] Public open-data CSV/JSON export.
- **Exit:** all rules covered by tests; citizen flow works on a low-end Android phone on 3G.

### Phase 5 — Hardening, Audit & Pilot (Weeks 8–10)
- [ ] Security review: Slither/Aderyn/ZAP; fix findings; external contract audit.
- [ ] Load test (k6); accessibility audit (axe, manual screen-reader pass).
- [ ] DPDP consent flow, privacy policy, terms (kn/ta/hi/en).
- [ ] Monitoring, alerts, backups, runbooks (upgrade, pause, key rotation, incident response).
- [ ] Staging soak test (1 week) on MST testnet.
- [ ] Pilot with one ward: onboard 1 official, 2–3 auditors, 2 contractors; 3–5 real projects (ledger mode).
- [ ] Mainnet go/no-go review (§8.4) → deploy to MST mainnet.
- **Exit:** pilot live; contracts verified on mstscan.com; public transparency page published.

### Team (suggested)
| Role | Count |
|---|---|
| Solidity engineer | 1 |
| Backend engineer (Node/TS) | 1 |
| Frontend engineer (React) | 1 |
| Designer (UX + i18n) | 0.5 |
| QA / DevOps | 0.5 |
| Product / Govt liaison | 0.5 |

---

## 20. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MST docs differ from registry values (RPC, chain ID, EVM version) | Medium | High | Phase 0 verification; config-driven; chain-ID startup guard |
| MST RPC downtime / rate limits | Medium | High | Two mainnet RPCs + FallbackProvider; own node if MST allows; adaptive `getLogs` |
| No Safe/multisig infra on MST | Medium | Medium | Ship simple audited multisig contract + timelock |
| BridgeKey lacks injected provider / WalletConnect | Medium | Low | MetaMask as primary; test BridgeKey early |
| PoSA validator centralisation criticised | Medium | Medium | Transparent disclosure; periodic anchoring of Merkle roots to a second public chain (optional) |
| Government reluctance to use real data | High | High | Start in ledger mode, read-only pilot with public data, MoU with ward |
| Contractors faking proofs | Medium | High | Geofence, EXIF, pHash, multi-auditor, citizen grievances |
| PII leak on-chain | Low | Critical | Only hashes/CIDs on-chain; moderation before pinning; DPDP review |
| Relayer drained by spam | Medium | Medium | OTP, per-phone quotas, CAPTCHA, daily spend cap |
| Scope creep (hackathon → product) | High | Medium | Strict phase exit criteria; Phase 1 end = demo-ready fallback |

---

## 21. Open Questions to Confirm in MST Docs

Resolve these in Phase 0 from https://docs.mstblockchain.com/developer-docs (or MST developer support / MST Buddy) and record in `docs/adr/`:

1. **EVM version** supported (`paris` / `shanghai` / `cancun`)? Is `PUSH0` and `MCOPY` available?
2. Official **RPC endpoints**, rate limits, max `eth_getLogs` block range, archive node availability.
3. **Finality** guarantees under PoSA — recommended confirmation count.
4. **Contract verification** — Blockscout API path for Hardhat (`/api` vs `/api/v2`), any API key required.
5. Is there an **MST-20 / MST-721** token standard naming or registry requirement, or plain ERC-20/721?
6. Any **deployer whitelisting** or permissioned contract deployment on mainnet?
7. Is **Safe (Gnosis) multisig**, **Multicall3**, **ERC-4337 EntryPoint** deployed on MST? Addresses?
8. **BridgeKey** — injected provider name (`window.ethereum`?), WalletConnect support, deep links.
9. Testnet **faucet limits** and whether a team/project allocation is available for pilots.
10. Subgraph / indexing service (The Graph or MST-native) availability.
11. Gas price model — EIP-1559 or legacy `gasPrice`? Recommended min gas price.
12. Any grant / ecosystem program for govtech projects (funding the relayer, audit).

---

## 22. Appendices

### Appendix A — Environment variables (`.env.example`)
```bash
# ---- General ----
NODE_ENV=development
NS_DEMO_MODE=false
PORT=3001
PUBLIC_BASE_URL=http://localhost:5173

# ---- Chain ----
NS_CHAIN=mstTestnet                    # local | mstTestnet | mstMainnet
MST_RPC_URLS=https://testnetrpc.mstblockchain.com
MST_WS_URL=wss://testnetrpc.mstblockchain.com
MST_CHAIN_ID=91562037
MST_EXPLORER_URL=https://testnet.mstscan.com
CONFIRMATIONS=6
INDEXER_BATCH_SIZE=2000
RELAYER_PRIVATE_KEY=                   # dev only; use KMS in staging/prod
RELAYER_KMS_KEY_ID=
DEPLOYER_PRIVATE_KEY=                  # contracts package only, never in API

# ---- Data ----
DATABASE_URL=postgresql://ns_user:change_me@localhost:5432/nammaseva
REDIS_URL=redis://localhost:6379

# ---- Auth ----
JWT_SECRET=
SIWE_DOMAIN=localhost:5173
OTP_PROVIDER=msg91
OTP_API_KEY=
PHONE_HASH_PEPPER=

# ---- IPFS ----
PINATA_JWT=
PINATA_GATEWAY=https://<your-gateway>.mypinata.cloud
IPFS_BACKUP_PIN_URL=

# ---- Frontend (Vite) ----
VITE_NS_CHAIN=mstTestnet
VITE_NS_CHAIN_ID=91562037
VITE_NS_RPC_URL=https://testnetrpc.mstblockchain.com
VITE_NS_EXPLORER_URL=https://testnet.mstscan.com
VITE_NS_IPFS_GATEWAY=https://<your-gateway>.mypinata.cloud
VITE_NS_WALLETCONNECT_PROJECT_ID=
VITE_NS_API_URL=http://localhost:3001
```

### Appendix B — Add MST network to a wallet
```ts
await window.ethereum.request({
  method: "wallet_addEthereumChain",
  params: [{
    chainId: "0x5752035",                      // 91562037 (testnet)
    chainName: "MST Testnet",
    nativeCurrency: { name: "MST Native Coin", symbol: "tMSTC", decimals: 18 },
    rpcUrls: ["https://testnetrpc.mstblockchain.com"],
    blockExplorerUrls: ["https://testnet.mstscan.com"],
  }],
});
// Mainnet: chainId "0x1226" (4646), symbol "MSTC",
// rpcUrls ["https://mariorpc.mstblockchain.com"], explorer "https://mstscan.com"
```

### Appendix C — File-by-file migration map
| Current file | Action |
|---|---|
| `decentralitrack/contracts/hardhat.config.js` | → `packages/contracts/hardhat.config.ts`, replace `amoy` with `mstTestnet`/`mstMainnet`, add verify config |
| `decentralitrack/contracts/contracts/RoleManager.sol` | → `NammaSevaAccess.sol` (ward/dept scoping, RELAYER role, Pausable) |
| `…/ProjectRegistry.sol` | Fix C-1, M-1, M-3; UUPS; custom errors |
| `…/MilestoneEscrow.sol` | Fix C-2, H-1..H-4, M-2; ledger/escrow mode; UUPS |
| `…/scripts/deploy.js` | → `deploy.ts` + `grantRoles.ts` + `verify.ts` + `exportAbis.ts`; no hard-coded Hardhat accounts |
| `…/scripts/verifyOnChain.js` | → `smokeTest.ts` for MST testnet |
| `…/test/DecentraliTrack.test.js` | → `NammaSeva.test.ts` + Foundry invariants |
| `artifacts/api-server/src/services/blockchainConfig.ts` | Rewrite (§9.2) |
| `…/services/blockchainListener.ts` | Replace with `indexer/` module (§9.3) |
| `…/services/contractService.ts` | Reduce to read helpers + relayer; remove role-key signing |
| `…/services/ipfsService.ts` | Add EXIF/geofence/pHash, redundancy pinning |
| `…/services/anomalyEngine.ts` | Rules v2 on Postgres (§14) |
| `…/services/blockchainLogger.ts` | Replace with `chain_events` table queries |
| `…/data.ts` | Demo mode only |
| `…/routes/*.ts` | Per §9.5; add `grievances.ts`, `verify.ts`, `tx.ts`, `public.ts` |
| `artifacts/decentralitrack/src/abis/*.json` | Delete — import from `packages/chain` |
| `…/src/config/contracts.js` | → `packages/chain` + `VITE_NS_*` |
| `…/src/components/BlockchainStatusBar.tsx` | Show MST network, head block, indexer lag |
| `…/src/components/BlockchainProofPanel.tsx` | mstscan links, "Verify on chain" |
| `…/src/lib/auth.tsx` | SIWE + OTP |
| `…/src/pages/*` | Rebrand + §11.2 |
| `lib/db/src/schema/index.ts` | Implement §12 |
| `lib/api-spec/openapi.yaml` | Update per §9.5 |
| `.env.example`, `docker-compose.yml`, `Dockerfile.*`, `nginx.conf` | Rename, add Redis/indexer, MST vars |
| `README.md` | Rewrite for Namma Seva on MST |

### Appendix D — Definition of Done (per feature)
- Contract change: tests + NatSpec + gas snapshot + Slither clean + deployed & verified on MST testnet.
- API change: OpenAPI updated, client regenerated, integration test, logs/metrics added.
- UI change: all 4 languages, mobile responsive, axe clean, E2E test where it touches a tx.
- Docs: README/runbook/ADR updated.

### Appendix E — Glossary
| Term | Meaning |
|---|---|
| **MST / MSTC** | MST Blockchain and its native coin |
| **PoSA** | Proof of Staked Authority — MST's consensus |
| **mstscan** | MST's Blockscout-based block explorer |
| **BridgeKey** | MST ecosystem multi-chain wallet |
| **SIWE** | Sign-In With Ethereum (EIP-4361) |
| **ERC-2771** | Meta-transaction standard used for gasless citizen actions |
| **UUPS** | Upgradeable proxy pattern |
| **CID** | IPFS content identifier |
| **ULB / BBMP** | Urban Local Body / Bruhat Bengaluru Mahanagara Palike |
| **PFMS** | Public Financial Management System (Govt. of India payments) |
| **DPDP** | Digital Personal Data Protection Act, 2023 |

---

**References**
- MST Blockchain Developer Docs — https://docs.mstblockchain.com/developer-docs
- MST Blockchain — https://mstblockchain.com/
- MST Testnet faucet — https://faucet.mstblockchain.com/
- MST Testnet explorer — https://testnet.mstscan.com · Mainnet — https://mstscan.com
- Chain registry entries — https://chainlist.org/chain/4646 · https://chainlist.org/chain/mst%20testnet

*Namma Seva — every rupee, on-chain. Every citizen, informed.*
