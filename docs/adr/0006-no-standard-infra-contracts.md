# ADR 0006 — No Safe / Multicall3 / EntryPoint on MST

- **Status:** Accepted · **Date:** 2026-09-28

## Context
The plan wants ADMIN held by a multisig + timelock (§7.5), and batched reads would benefit from
Multicall3 (§21 Q7). MST's mainnet checklist suggests "Gnosis Safe".

## Evidence — `eth_getCode` at canonical addresses (2026-09-28), testnet and mainnet
| Contract | Address | Testnet | Mainnet |
|---|---|---|---|
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | absent | absent |
| CREATE2 deployer (Arachnid) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` | absent | absent |
| Safe 1.4.1 singleton | `0x41675C099F32341bf84BFc5382aF534df5C7461a` | absent | absent |
| Safe 1.4.1 proxy factory | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | absent | absent |
| Safe 1.3.0 singleton | `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552` | absent | absent |
| ERC-4337 EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | absent | absent |
| ERC-4337 EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | absent | absent |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | absent | absent |

## Decision
- Phase 2 ships **`NammaSevaMultisig`** (simple audited M-of-N) + OpenZeppelin `TimelockController`
  as ADMIN — the plan's documented fallback.
- Gasless citizen actions use **ERC-2771** (`TrustedForwarder`) as planned — not ERC-4337.
- Batch reads use our own view helpers (or deploy Multicall3 ourselves if needed); don't assume it exists.
- Deployments are plain `CREATE`; addresses are recorded in `packages/chain/deployments/*.json`.

## Consequences
- The multisig contract is in audit scope for Phase 6.
