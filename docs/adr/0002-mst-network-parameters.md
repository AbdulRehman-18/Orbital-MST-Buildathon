# ADR 0002 — MST network parameters

- **Status:** Accepted · **Date:** 2026-09-28

## Context
The plan's values came from the ethereum-lists/chains registry and had to be confirmed (§4, §21 Q2).
The docs site renders as Markdown via `<page>.md` (see `https://docs.mstblockchain.com/llms.txt`).

## Evidence (live JSON-RPC, 2026-09-28)

| | Testnet | Mainnet |
|---|---|---|
| `eth_chainId` | `0x5752035` = **91562037** ✅ | `0x1226` = **4646** ✅ |
| `web3_clientVersion` | `Geth/v1.7.3-5c7d31a4-20260519` | `Geth/v1.4.14-86406c08` |
| Avg block time (1000 blocks) | **3.00 s** | **3.00 s** |
| Block gas limit | 55,000,000 | 30,000,000 |
| Header `difficulty` | 1 / 2 (in-turn / out-of-turn signer — PoSA/Parlia-style) | same |
| Archive state | ❌ ("historical state … is not available") | ❌ ("missing trie node") |
| `https://craftrpc.mstblockchain.com` | — | ❌ no response at time of test |

Explorers: `https://testnet.mstscan.com` (Blockscout v9.0.2), `https://mstscan.com` (Blockscout v8.0.2).
Faucet: `https://faucet.mstblockchain.com` (fixed amount per request).

## Decision
- `packages/chain/src/networks.ts` is the single source of these values.
- Mainnet uses both `mariorpc` and `craftrpc` behind an ethers `FallbackProvider` (Phase 3) —
  `craftrpc` was down during testing, which is exactly the case the fallback covers.
- The API refuses to boot if `eth_chainId` ≠ the configured network (Phase 3 startup guard).
- No code may depend on historical state (`eth_call` at old blocks); read current state or events.

## Consequences
- Testnet and mainnet run **different client versions** despite the docs saying testnet mirrors
  mainnet — see ADR 0003 for the EVM impact. Re-run the probe before mainnet.
