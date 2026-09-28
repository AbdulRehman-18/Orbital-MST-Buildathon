# ADR 0007 — Contract verification via Blockscout

- **Status:** Accepted · **Date:** 2026-09-28

## Context
§21 Q4: which verification API Hardhat should use. MST docs link to Blockscout's verification guide.

## Evidence (2026-09-28)
- `GET https://testnet.mstscan.com/api?module=block&action=eth_block_number` → 200, JSON-RPC result.
- `GET https://mstscan.com/api?module=block&action=eth_block_number` → 200.
- `/api/v2/config/backend-version`: testnet `v9.0.2`, mainnet `v8.0.2`.

## Decision
Use `hardhat-verify` with Etherscan-compatible custom chains (any non-empty API key):

| network | apiURL | browserURL |
|---|---|---|
| `mstTestnet` (91562037) | `https://testnet.mstscan.com/api` | `https://testnet.mstscan.com` |
| `mstMainnet` (4646) | `https://mstscan.com/api` | `https://mstscan.com` |

Sourcify disabled. Proxies are verified via `@openzeppelin/hardhat-upgrades` + Blockscout's proxy detection.

## Consequences
- Verified in practice during the Phase 2 testnet deploy; if `/api` verification fails, fall back to `/api/v2/smart-contracts/:address/verification`.
