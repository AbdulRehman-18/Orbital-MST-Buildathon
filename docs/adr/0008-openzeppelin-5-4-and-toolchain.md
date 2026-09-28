# ADR 0008 — OpenZeppelin 5.4.0 pinned; Hardhat 3 on Node 22

- **Status:** Accepted · **Date:** 2026-09-28

## Context
ADR 0003 fixes the compile target at `evmVersion: "shanghai"` because MST mainnet rejects Cancun
opcodes. Compiling Phase 2 against the latest OpenZeppelin (5.6.1) failed:

- `AccessControlEnumerable` → `EnumerableSet` → `utils/Arrays.sol` uses `mcopy` (Cancun).
- `ERC2771Forwarder` → … → `utils/Bytes.sol` uses `mcopy`.

Surveying releases (`grep` for `mcopy|tstore|tload` in each tarball, excluding `*Transient*`):

| OZ | Files with Cancun builtins | Reachable from our imports? |
|---|---|---|
| 5.1.0 | draft-ERC20TemporaryApproval | no |
| 5.2.0 – 5.4.0 | + `Bytes.sol` | **no** (import graph checked) |
| 5.5.0 | + `Arrays`, `RLP`, `Memory`, `SignatureChecker`, `Accumulators` | yes |
| 5.6.1 | same as 5.5 | yes |

Hardhat 3.18 (current) requires Node ≥ 22.13; the repo was on Node 20 (EOL April 2026).

## Decision
- Pin `@openzeppelin/contracts` and `@openzeppelin/contracts-upgradeable` to **exactly 5.4.0**.
- Don't use `AccessControlEnumerable`: `NammaSevaAccess` tracks role member counts itself.
- `MilestoneEscrow` uses `ReentrancyGuardUpgradeable` (5.4's plain guard isn't proxy-safe).
- `pnpm --filter @namma-seva/contracts check:opcodes` runs after every build and fails if any
  compilation isn't Shanghai or any compiled source (ours or a dependency) uses a Cancun builtin.
  A linear bytecode scan was rejected: via-IR data sections produce false positives.
- Toolchain: Hardhat 3 (ESM, built-in coverage, gas stats and Foundry-style Solidity fuzz/invariant
  tests), OZ hardhat-upgrades 4, Node 22 LTS (`.nvmrc`, `engines`, Dockerfiles).

## Consequences
- Upgrading OpenZeppelin requires re-running `check:opcodes`; bump only when it passes (or when
  MST mainnet activates Cancun — then supersede ADR 0003 and this ADR).
- Developers run `nvm use` (Node 22) before working in the repo.
