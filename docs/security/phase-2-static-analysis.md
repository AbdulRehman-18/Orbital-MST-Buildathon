# Phase 2 — Static analysis triage

- **Date:** 2026-09-28 · **Scope:** `packages/contracts/contracts/**` excluding `legacy/` and `mocks/`
- **Tools:** Slither (via `uv`, 75 detectors) · Aderyn 0.6.8 (88 detectors)
- **Reproduce:** `pnpm --filter @namma-seva/contracts slither` · `pnpm --filter @namma-seva/contracts aderyn`

This is an internal pre-audit triage, not a substitute for the external audit in Phase 6.

## Slither — 0 findings

After the fixes below, all 7 analysed units report **0 results** (informational/optimization
detectors off; `timestamp` excluded — see T-1). The script fails on any Medium or High.

Fixed during triage: events emitted after trusted external calls (`MilestoneEscrow.createMilestone`,
`NammaSevaMultisig.execute`) now emit first. `missing-zero-check` on the `set*` wiring functions
is a false positive (`_setOnce` rejects zero) and is annotated.

## Aderyn — 4 "High", 7 Low: all triaged, none exploitable

| Id | Finding | Verdict | Reasoning |
|---|---|---|---|
| H-1 | Contract locks Ether (Registry, Grievance, Tender) | False positive | The only payable entry point is OZ `UUPSUpgradeable.upgradeToAndCall`, callable only by ADMIN. No user flow sends value to these contracts. |
| H-2 | ETH transferred without address checks (`releaseFunds`, `refundUnallocated`) | False positive | Recipients aren't caller-supplied: the contractor recorded on the registry, or the treasury fixed at initialisation. Callers must be a ward official (`_checkRoleInWard`), which the detector doesn't model. Both are `nonReentrant` and follow checks-effects-interactions. |
| H-3 | State change after external call (16 sites) | False positive | Every flagged call is a `view` function on our own contracts (`registry.getProject`, `access.getRoleMemberCount`, `tender.hasOpenTender`), compiled as `STATICCALL` — cannot re-enter or mutate state. The only value-moving calls (`_send`) happen after all state updates. |
| H-4 | Unsafe integer downcasts (6 sites) | False positive | All are `uint64` ids from `uint64` counters (`++projectCount` etc.) or project ids already checked `≤ projectCount`. Amount casts to `uint128` (not flagged) are all bounded by a `uint128` budget/balance before the cast. |
| L-1 | Centralization risk | Accepted, by design | ADMIN can upgrade and pause. Mitigated on mainnet by the 3-of-5 multisig + 48 h timelock (ADR 0006) and published in the Transparency page (Phase 6). |
| L-2 / L-5 | Loops with storage ops / reverts | Accepted | `setWardAccessBatch` is ADMIN-only with caller-sized input; the multisig owner loop is capped at `MAX_OWNERS = 10`. |
| L-3 / L-4 | Numeric literals | Accepted | Coordinate bounds (±90e6 / ±180e6 micro-degrees) are self-describing inline. |
| L-6 | Address state var set without checks | False positive | Same as Slither `missing-zero-check`. |
| L-7 | Unchecked return | Accepted | `_grantRole` in the constructor always succeeds on a fresh contract; `_existing(tenderId)` is called for its revert, not its return. |

Fixed during triage: `nonReentrant` is now the first modifier on value-moving functions; an unused
import was removed.

## Design notes for the auditors

- **T-1 Timestamps.** Tender commit/reveal windows and the grievance SLA use `block.timestamp`.
  They are multi-day windows; validator timestamp drift (seconds) is irrelevant. Excluded from Slither.
- **Trust boundary.** `ProjectRegistry`, `MilestoneEscrow`, `GrievanceRegistry` and `TenderRegistry` trust
  each other only through set-once addresses (`setEscrow`, `setTenderRegistry`, `setGrievanceRegistry`).
- **Relayer power.** A compromised RELAYER key can file/upvote grievances under arbitrary citizen hashes
  (rate-limited per hash per day on-chain). It cannot touch projects, funds or roles. Key custody: KMS (Phase 3/6).
- **ESCROW vs LEDGER.** Only ESCROW mode moves native coin; production uses LEDGER (plan §7.4).
- **Invariants** enforced by fuzzing (`test/EscrowInvariants.t.sol`): funds conserved, allocated ≤ balance,
  spent = Σ paid milestones ≤ budget, escrow balance = recorded balance, unsettled count exact.
