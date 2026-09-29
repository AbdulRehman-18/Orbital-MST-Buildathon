# External smart-contract audit — scope and hand-off pack

Start the engagement at the **beginning of Phase 6** (2–3 weeks); nothing here is a substitute for it. Exit criterion: **0 open Critical/High** findings; every Medium fixed or accepted in writing by the Authority.

## In scope (commit: the release candidate tag — freeze it)
`packages/contracts/contracts/`:
- `NammaSevaAccess.sol` — roles, ward scoping, pause
- `NammaSevaBase.sol` — shared modifiers, UUPS authorisation
- `ProjectRegistry.sol`, `MilestoneEscrow.sol` (LEDGER and ESCROW modes), `GrievanceRegistry.sol` (ERC-2771 + per-citizen signers), `TenderRegistry.sol` (commit/reveal)
- `governance/NammaSevaMultisig.sol` (custom M-of-N, no Safe on MST — ADR 0006), `governance/Imports.sol` (OpenZeppelin `TimelockController`, `ERC2771Forwarder` as deployed)

Out of scope: `contracts/legacy/` (DecentraliTrack compatibility), `contracts/mocks/`, OpenZeppelin 5.4.0 itself (pinned).

## Deployment and operations (please review the process too)
- Compiler: solc 0.8.24, `viaIR`, optimizer 200, **EVM = shanghai** (MST mainnet lacks Cancun; a CI guard rejects `MCOPY`/`TSTORE`) — ADR 0003, 0008.
- UUPS upgrade path via multisig → timelock (48 h): `scripts/deploy.ts`, `scripts/handover.ts`, `scripts/multisig.ts`, `docs/runbooks/upgrade.md`.
- **Emergency stop design** (please attack it): PAUSER = timelock **and** multisig (instant 3-of-5); ADMIN = timelock only; `unpause` requires ADMIN. Tests: `test/Governance.test.ts` ("emergency pause and role rotation").
- Relayer/forwarder trust model: `docs/security/phase-2-static-analysis.md` §Design notes.

## Questions we especially want answered
1. Can any path move escrow funds other than `releaseFunds` after the approval thresholds? (invariants: `test/EscrowInvariants.t.sol`)
2. Can a compromised RELAYER key affect anything beyond grievances/upvotes under arbitrary citizen hashes?
3. Storage-layout safety of upgrades; initialisation of implementations; `_authorizeUpgrade` correctness.
4. Multisig: owner-set changes, threshold underflow, replay/ordering, `ExecutionFailed` handling, reentrancy through `execute`.
5. Timelock roles: proposer/executor = multisig, no admin (`address(0)`) — any bypass?
6. Denial-of-service: loops over owners/approvers/milestones; grievance and tender griefing.
7. Trust assumptions on `block.timestamp` for tender windows and grievance SLA (multi-day windows).

## What we provide
- Repository at the frozen commit; `pnpm install && pnpm --filter @namma-seva/contracts build && test` (unit, fuzz, invariants, coverage via `pnpm coverage`).
- Prior static analysis: Slither (0 findings after fixes) and Aderyn with triage in `phase-2-static-analysis.md`; CI runs both on every PR (`aderynGate.mjs` fails on any un-triaged High).
- Architecture: `docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md` §7–8, ADRs 0002–0010, 0012.
- A funded MST testnet deployment with the same commit for reproduction (`docs/deployments/mstTestnet.md` once published).

## Remediation workflow
Findings arrive as a private report → triage within 2 working days → fix PRs referencing the finding id, each with a regression test → auditor re-review of fixes → final report **published** (link set as `AUDIT_REPORT_URL`; the Transparency page then shows it). Re-freeze and re-tag after fixes; the mainnet deploy uses the re-audited tag only.

## Status
| Item | Status |
|---|---|
| Auditor engaged | ○ (Authority/Platform to select and contract) |
| Frozen commit shared | ○ |
| Report received / Criticals & Highs closed | ○ |
| Report published | ○ |
