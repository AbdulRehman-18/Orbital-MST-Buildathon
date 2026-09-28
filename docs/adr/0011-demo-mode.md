# ADR 0011 — Demo mode: real flows with burner wallets

- **Status:** Accepted · **Date:** 2026-09-29 · Plan §10 ("demo role cards only when NS_DEMO_MODE=true")

## Context
Judges, ward officers and team members need to try every role in minutes, without installing
MetaMask, funding wallets or receiving SMS. DecentraliTrack's demo cards used shared passwords and
server-held role keys, which bypassed exactly the parts that matter (wallet signatures, on-chain
roles, the relayer). A demo that takes a different code path proves nothing.

## Decision
- **Demo = the real flows with throwaway credentials.** With `NS_DEMO_MODE=true`:
  - `GET /api/demo` returns a demo cast and a burner **mnemonic** (Hardhat's public test mnemonic on
    `NS_CHAIN=local`, or `NS_DEMO_MNEMONIC` for a testnet demo with tiny faucet balances).
  - The web app derives each burner key in the browser and connects it through a wagmi connector
    (`apps/web/src/lib/burner.ts`). Sign-in is ordinary SIWE; roles are read from `NammaSevaAccess`;
    every action is a real transaction indexed like any other.
  - Citizen OTP responses include `devCode`, so the phone flow (and the gasless relayer behind it)
    runs end to end without SMS.
  - Without `RELAYER_PRIVATE_KEY`, the relayer uses the cast's burner at index 5.
- **Guard rails:** demo mode is refused in production and on MST mainnet (config), the UI shows a
  persistent "DEMO" banner, and the cast is fictional.
- **`pnpm demo`** starts chain → deploy → PGlite → migrations → `demo:seed` (real transactions creating
  projects in every lifecycle state across seeded BBMP wards) → indexer → API → web; the chain mines
  every 2 s so confirmations advance like MST's ~3 s blocks.
- Local deploys default to **LEDGER** mode (INR paise), matching the pilot; `NS_LOCAL_MODE=ESCROW`
  switches back to native-coin escrow.

## Consequences
- Anyone holding the demo page can act as any demo role — acceptable only because the chain and data
  are disposable. Never point a demo at a chain whose state matters.
- A testnet demo must fund the burner accounts from the faucet and grant their roles (`demo:seed` does
  both grant steps if the demo admin is the deployer).
