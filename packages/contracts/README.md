# packages/contracts

Hardhat (TypeScript) project for the Namma Seva contracts — built in **Phase 2**
(`docs/phases/PHASE_2_CONTRACTS.md`).

`legacy/` holds the DecentraliTrack sources (`RoleManager`, `ProjectRegistry`, `MilestoneEscrow`,
deploy/verify scripts, tests) **unchanged, for reference only**. They contain the defects listed
in plan §3.2 (C-1, C-2, H-1…H-5, M-1…M-4, L-1, L-2) and must not be deployed.

Compiler target is fixed by ADR 0003: Solidity `0.8.24`, `evmVersion: "shanghai"`.
