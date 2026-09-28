# ADR 0004 — Confirmations & log indexing limits

- **Status:** Accepted · **Date:** 2026-09-28

## Context
The indexer (Phase 3) must be reorg-safe and restartable. Plan §9.3 assumed 6 confirmations and
a 2000-block `getLogs` batch pending confirmation (§21 Q2, Q3, Q10).

## Evidence (2026-09-28)
- `eth_getBlockByNumber("finalized")` and `("safe")` both return **the head block** on testnet and
  mainnet — the node exposes no real finality signal.
- Header `difficulty` alternates 1/2 (in-turn / out-of-turn signer), so short reorgs are possible.
- `eth_getLogs` over all contracts: mainnet 5,000 blocks → 5,298 logs in 1.3 s; testnet accepted
  up to 100,000 blocks. Unbounded address-less queries at 50k+ blocks on mainnet timed out.
- No subgraph / indexing service is documented.

## Decision
- **CONFIRMATIONS = 6** (~18 s). Do not trust the `finalized` / `safe` tags.
- Indexer batch **2,000 blocks**, always filtered by our contract addresses, halving on error or timeout.
- Build our own indexer (plan §9.3); no third-party indexing dependency.
- Reorg check on every loop via the stored `last_block_hash`, rollback depth ≥ 12 blocks.

## Consequences
- ~18 s from inclusion to "Confirmed" in the UI; "Pending" badges cover the gap.
