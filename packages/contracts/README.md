# @namma-seva/contracts

Namma Seva smart contracts for **MST Blockchain** — Hardhat 3, Solidity 0.8.24,
`evmVersion: "shanghai"` (MST mainnet has no Cancun — [ADR 0003](../../docs/adr/0003-evm-version-shanghai.md)),
OpenZeppelin 5.4.0 pinned ([ADR 0008](../../docs/adr/0008-openzeppelin-5-4-and-toolchain.md)).

> Requires Node 22.13+ — run `nvm use` at the repo root.

## Contracts

| Contract | Kind | Role |
|---|---|---|
| `NammaSevaAccess` | plain | Roles (ADMIN, GOVT_OFFICIAL, AUDITOR, CONTRACTOR, RELAYER, PAUSER), ward scoping, global pause |
| `ProjectRegistry` | UUPS proxy | Project lifecycle, M-of-N auditor approval, pause/cancel/close |
| `MilestoneEscrow` | UUPS proxy | Sanctions/escrow, milestones, contractor proof, approvals, release, refunds — LEDGER or ESCROW mode |
| `GrievanceRegistry` | UUPS proxy + ERC-2771 | Citizen grievances (hashed identity), upvotes, escalation, auditor response |
| `TenderRegistry` | UUPS proxy | Sealed-bid commit/reveal tenders → contractor assignment |
| `TrustedForwarder` | plain | OZ `ERC2771Forwarder` for gasless citizen meta-transactions |
| `NammaSevaMultisig` + `NammaSevaTimelock` | plain | ADMIN on mainnet (no Safe on MST — [ADR 0006](../../docs/adr/0006-no-standard-infra-contracts.md)) |

Upgrades are ADMIN-only; on mainnet ADMIN = timelock (48 h) proposed by the 3-of-5 multisig.
IPFS CIDs are emitted in events; storage keeps content hashes ([ADR 0009](../../docs/adr/0009-cids-in-events.md)).

`contracts/legacy/Legacy*.sol` are the **unchanged** DecentraliTrack contracts (names prefixed),
compiled only so `test/AuditFindings.test.ts` can demonstrate each plan §3.2 defect. Never deploy.

## Commands

| | |
|---|---|
| `pnpm build` | compile + Shanghai/Cancun opcode guard |
| `pnpm test` | all tests (TypeScript + Solidity fuzz/invariant) |
| `pnpm test:ts` / `pnpm test:sol` | one layer only |
| `pnpm coverage` | line/statement coverage |
| `pnpm gas` | per-function gas stats |
| `pnpm slither` | static analysis (needs `uv`), fails on Medium+ |
| `pnpm typecheck` | TS types for scripts and tests |
| `pnpm node` | local chain (31337, Shanghai) |
| `pnpm deploy:local` / `smoke:local` / `roles:local` | full flow against `pnpm node` |
| `pnpm export-abis` | write typed ABIs + public deployments into `@namma-seva/chain` |

Deploying to MST testnet: [docs/runbooks/deploy-mst-testnet.md](../../docs/runbooks/deploy-mst-testnet.md).

## Test suite

- `test/AuditFindings.test.ts` — every §3.2 defect: exploit **succeeds on legacy**, **blocked on v2**.
- `test/{ProjectRegistry,MilestoneEscrow,GrievanceRegistry,TenderRegistry,NammaSevaAccess,Governance,Deploy}.test.ts`
  — every function, revert and event; both escrow modes; ERC-2771 meta-tx; multisig → timelock upgrade.
- `test/EscrowInvariants.t.sol` — stateful invariants (funds conserved, allocated ≤ balance,
  spent = Σ paid, escrow solvent, unsettled count) over random action sequences.
- `test/Fuzz.t.sol` — coordinate bounds, budget cap, commitment binding.

## Configuration

- `config/networks.ts` — mode, treasury, grievance settings, governance per network.
- `config/roles.<network>.json` — role holders and wards (template: `roles.example.json`).
- Secrets via env / Hardhat config variables: `DEPLOYER_PRIVATE_KEY`, `MST_TESTNET_RPC`, `MST_MAINNET_RPC`.
