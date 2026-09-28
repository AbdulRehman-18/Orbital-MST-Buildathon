# Runbook — run the backend locally (API + indexer + relayer)

Brings up Postgres, Redis, a local chain with the contracts deployed, the indexer and the API.
~5 minutes. For MST testnet, skip step 2 and set `NS_CHAIN=mstTestnet` once the testnet
manifest exists ([deploy runbook](deploy-mst-testnet.md)).

## 1. Dependencies
```bash
pnpm install
```
```bash
cp .env.example .env
```
```bash
pnpm infra:up
```
Postgres 16 on :5432 and Redis 7 on :6379 (Docker). Without Redis the API falls back to
in-process rate limits and relayer queue (dev only; refused in production).

## 2. Local chain (terminal 1, keep running)
```bash
pnpm chain:node
```
Then, in another terminal, deploy (writes `packages/chain/deployments/localhost.json`):
```bash
pnpm --filter @namma-seva/contracts deploy:local
```

## 3. Environment for the local chain
In `.env`:
```
NS_CHAIN=local
MST_RPC_URLS=http://127.0.0.1:8545
CONFIRMATIONS=2
```
Optional relayer (gasless citizen grievances): set `RELAYER_PRIVATE_KEY` to a local-only key and
grant it `RELAYER_ROLE` (`roles:local` with `config/roles.localhost.json`, see
`config/roles.example.json`). Never reuse that key anywhere else.

## 4. Database
```bash
pnpm db:migrate
```
```bash
pnpm db:seed
```
Seeds BBMP wards (en/kn/ta/hi) and departments. Safe to re-run.

## 5. Indexer (terminal 2) and API + web (terminal 3)
```bash
pnpm indexer
```
```bash
pnpm dev
```
Check:
- http://localhost:3001/api/ready → `ready: true` once the indexer has ticked
- http://localhost:3001/api/chain/status → head, indexed block, lag, relayer balance
- http://localhost:3001/api/ledger → indexed events

## Rebuild the read model
Stop the indexer first (it holds the advisory lock), then:
```bash
pnpm --filter @namma-seva/api indexer:rebuild --from <deployBlock>
```
It truncates every projection + `chain_events`, replays from `<deployBlock>` (default: the
manifest's `blockNumber`) and prints the checksum. Compare with a live DB:
```bash
pnpm --filter @namma-seva/api indexer:checksum
```

## Tests
```bash
pnpm test:api
```
Runs everything on in-process Postgres (PGlite). The chain suite (`test/e2e.chain.test.ts`) runs
only when a local node with a `localhost.json` manifest is up (steps 2) — otherwise it is skipped.

## Production shape
One image (`infra/docker/Dockerfile.api`), three commands: `node dist/migrate.mjs --seed`
(release step), `node dist/index.mjs` (API, N replicas), `node dist/indexer.mjs run`
(**exactly one** replica per network). Required in production: `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, `PHONE_HASH_PEPPER`, a real `OTP_PROVIDER`, `PINATA_JWT`; `NS_DEMO_MODE` must be off.
