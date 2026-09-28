# ADR 0003 — Compile for `evmVersion: "shanghai"`

- **Status:** Accepted · **Date:** 2026-09-28 · Supersedes the plan's provisional `paris` (§7.1, M-4)

## Context
Solidity ≥ 0.8.20 emits `PUSH0` (Shanghai) by default, and ≥ 0.8.25 defaults to Cancun
(`MCOPY`). MST docs don't state the active hardfork.

## Evidence
Executed raw bytecode with `eth_call` (no `to`) on 2026-09-28:

| Opcode | Fork | Testnet | Mainnet |
|---|---|---|---|
| `PUSH0` (`0x5f`) | Shanghai | ✅ | ✅ |
| `MCOPY` (`0x5e`) | Cancun | ✅ | ❌ `invalid opcode: MCOPY` |
| `TSTORE` (`0x5d`) | Cancun | ✅ | ❌ `invalid opcode: TSTORE` |

Testnet headers also carry `withdrawalsRoot` / `blobGasUsed`; mainnet headers don't.

## Decision
- Hardhat: Solidity `0.8.24`, `evmVersion: "shanghai"` for **all** networks, so the bytecode
  tested on testnet is byte-identical to what ships on mainnet.
- Do not use transient-storage features (e.g. OpenZeppelin `ReentrancyGuardTransient`);
  use the classic `ReentrancyGuard`.
- CI adds a check that compiled bytecode contains no `MCOPY`/`TSTORE`/`BLOBHASH` (Phase 2).

## Consequences
- Slightly higher gas than Cancun-optimised code; negligible at MST fees.
- Revisit when mainnet upgrades — re-run the opcode probe and write a superseding ADR.
