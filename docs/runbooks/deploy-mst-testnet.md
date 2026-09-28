# Runbook — deploy to MST testnet

Deploys the Namma Seva contracts to MST testnet (chain 91562037), verifies them on
testnet.mstscan.com and runs the end-to-end smoke test. ~15 minutes.

## Prerequisites
- Node 22 (`nvm use`), `pnpm install` done, `uv` installed (for Slither, optional).
- A **fresh** deployer wallet (never a Hardhat default key or a reused personal key).
- Deployer funded from https://faucet.mstblockchain.com — a full deploy costs ≈ 0.01 tMSTC at
  1 gwei; keep ≥ 0.2 tMSTC so the smoke test can fund its throwaway actors.

## 1. Pre-flight
```bash
cd packages/contracts
```
```bash
pnpm build && pnpm test && pnpm slither
```
All must pass. `pnpm build` includes the Shanghai opcode guard.

## 2. Secrets (never commit)
```bash
export DEPLOYER_PRIVATE_KEY=0x...        # fresh testnet-only key
export MST_TESTNET_RPC=https://testnetrpc.mstblockchain.com
```

## 3. Deploy
```bash
pnpm deploy:mst-testnet
```
Writes `deployments/mstTestnet.json` and mirrors it to `packages/chain/deployments/`. Note the
**start block** — it's the indexer's starting point (Phase 3).

## 4. Verify on mstscan
```bash
pnpm verify:mst-testnet
```
Verifies every implementation and plain contract via Blockscout (ADR 0007). Proxies are detected
by Blockscout automatically.

## 5. Smoke test (demo evidence)
```bash
pnpm smoke:mst-testnet
```
Runs create → 2 approvals → fund → milestone → proof → 2 approvals → release → grievance → upvote
with throwaway wallets and prints a testnet.mstscan.com link per step. Save the output for the demo.

## 6. Team roles
Fill `config/roles.mstTestnet.json` with the team's wallets (officials, 3 auditors, contractors,
relayer) and ward ids, then:
```bash
pnpm roles:mst-testnet
```
Idempotent — safe to re-run after edits.

## 7. Publish addresses to the apps
```bash
pnpm export-abis
```
Regenerates `packages/chain/src/deployments.ts` with the testnet addresses. Commit
`deployments/mstTestnet.json`, `packages/chain/deployments/mstTestnet.json` and the regenerated
`packages/chain/src/*`.

## Rollback / redeploy
Testnet deployments are disposable: fix, re-run steps 3–7. The manifest is overwritten; the
old contracts stay on-chain but nothing points at them.

## Mainnet differences (Phase 6)
LEDGER mode, real treasury, `governance` block in `config/networks.ts` (multisig owners, 48 h
timelock), hardware-wallet deployer, then `grantRoles` → `CONFIRM_HANDOVER=mstMainnet pnpm handover:mst-mainnet`.
See plan §8.4 for the go/no-go gates.
