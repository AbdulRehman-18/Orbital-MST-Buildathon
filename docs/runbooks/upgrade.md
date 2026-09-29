# Runbook — upgrade contracts or roll the apps

## A. Application rollout (API, indexer, web) — routine
1. Merge to `main`; *Deploy (dev)* builds `namma-seva-api` and `namma-seva-web` images tagged `sha-<commit>`.
2. Staging first: deploy that tag, run the e2e suite against it (`E2E_BASE_URL=https://staging… pnpm --filter @namma-seva/web e2e`).
3. Production: set `TAG=sha-…` and `docker compose -f infra/compose/docker-compose.prod.yml --env-file infra/compose/prod.env up -d`. Order is enforced by compose: **migrate** (idempotent Drizzle migrations) → **api** → **indexer** → **web**.
4. Watch `/api/ready`, the *Namma Seva — overview* Grafana board and the alerts for 30 minutes.
5. **Rollback:** redeploy the previous `TAG`. Migrations are forward-only and additive by policy, so the previous image runs against the newer schema; a migration that cannot be (drops/renames) needs an expand → migrate → contract sequence across two releases.

**Indexer changes that alter projections** require a rebuild from chain (the DB is a cache; the chain is the source of truth): stop the indexer, `pnpm --filter @namma-seva/api indexer:rebuild`, start it. Public reads stay up on stale data during the rebuild; `indexer_lag_blocks` shows progress.

## B. Contract upgrade (UUPS proxies) — after mainnet handover
All registries are UUPS proxies; `upgradeToAndCall` is ADMIN-only, so an upgrade is **multisig proposal → 48 h timelock → execute**. Never upgrade during an open incident without pausing first.

1. **Prepare & audit.** Change the contract; the OpenZeppelin upgrades plugin validates storage-layout compatibility (`hardhat test` includes upgrade tests). Re-run Slither/Aderyn and the fuzz suite. A change to money-moving code needs the external auditor's sign-off on the diff.
2. **Deploy the new implementation** (not the proxy), from a fresh throw-away funded key — it has no privileges:
   ```bash
   pnpm --filter @namma-seva/contracts exec hardhat run scripts/prepareUpgrade.ts --network mstMainnet   # prints the new implementation address
   ```
   Verify it on mstscan and publish the diff + audit note.
3. **Announce** at least 48 h before it can execute: the timelock makes every scheduled operation public on-chain.
4. **Schedule** through the multisig:
   ```bash
   pnpm --filter @namma-seva/contracts multisig mstMainnet call registry "upgradeToAndCall(address,bytes)" '["0xNEWIMPL","0x"]' --timelock
   ```
   Three owners confirm, one executes. Keep the **salt**.
5. **Execute** after the delay: same call with `--timelock --execute-scheduled --salt <salt>`.
6. **Verify**: `cast implementation <proxy>` equals the new address; `/api/transparency` shows the new implementation; run the smoke test on staging with the same implementation first.
7. **Update the app**: if ABIs changed, `pnpm --filter @namma-seva/contracts export-abis`, redeploy the API/indexer (the indexer replays nothing — events are unchanged unless new ones were added; if new events are indexed, do a rebuild).

Rollback of a bad upgrade is another upgrade (48 h) — so **pause first** if the new code is dangerous ([pause-and-resume.md](pause-and-resume.md)).
