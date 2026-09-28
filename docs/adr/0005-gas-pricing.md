# ADR 0005 — Gas pricing

- **Status:** Accepted · **Date:** 2026-09-28

## Context
MST docs describe EIP-1559 fees with a burned base fee (§21 Q11).

## Evidence (2026-09-28)
- Blocks carry `baseFeePerGas`, but it is **`0x0`** on both networks.
- `eth_gasPrice` = `eth_maxPriorityFeePerGas` = **1 gwei** on both networks.
- A typical 100k-gas call therefore costs ≈ 0.0001 MSTC.

## Decision
- Send type-2 (EIP-1559) transactions; let ethers/viem estimate. Floor `maxPriorityFeePerGas`
  at 1 gwei — lower tips risk not being included.
- The relayer (Phase 3) alerts below 10 MSTC; at current prices that is ~100k sponsored actions.

## Consequences
- If base fee starts being non-zero, estimation handles it; no code change needed.
