# Namma Seva (Orbital MST Buildathon)

> **ನಮ್ಮ ಸೇವೆ · நம்ம சேவை · नम्मा सेवा — "Our Service"**
> Every rupee, on-chain. Every citizen, informed.

Namma Seva lets citizens see, verify and question how public money is spent on local
infrastructure — roads, drains, water supply, street lights, parks and civic facilities. Every
project, milestone, proof photo, approval and payment is anchored on **MST Blockchain**, so
records can't be silently edited or deleted. Citizens don't need a crypto wallet; officials,
auditors and contractors sign with their own.

Built for the Orbital MST Buildathon, evolving the DecentraliTrack MVP (Polygon Amoy) onto MST.

## Why this project matters

Public project data is often fragmented, delayed, or hard to verify. Namma Seva aims to solve this by:

- Recording key project lifecycle actions as immutable blockchain transactions.
- Making project verification citizen-friendly and multilingual.
- Strengthening trust through auditable approvals, milestone proofs, and transparent fund-release workflows.

## Core goals

- Move the platform from Polygon Amoy to **MST testnet/mainnet**.
- Rebrand and localize as **Namma Seva** (Kannada, Tamil, Hindi, English).
- Harden smart contracts and remove centralized key custody risks.
- Build a production-grade backend/indexer where the chain is the source of truth.
- Add grievance, tender, anomaly-detection, and compliance capabilities.

## Status

**Phase 4 of 6 — Web app, wallets & i18n** (engineering complete against a local chain; MST testnet run pending the testnet deploy).

- ✅ Phase 1: monorepo, shadcn web shell, API shell, MST chain package, ADRs
- ✅ Phase 2: 6 contracts + multisig/timelock, 109 tests, audit regressions, Slither clean — see [packages/contracts](packages/contracts/README.md)
- ✅ Phase 3: Postgres read model, reorg-safe indexer, SIWE + phone OTP, gasless relayer, OpenAPI v0.3 — see the [backend runbook](docs/runbooks/backend-local.md) and [ADR 0010](docs/adr/0010-backend-indexer-relayer.md)
- ✅ Phase 4: role dashboards (citizen, official, auditor, contractor, admin), live map, wallet-signed flows, 4 languages, PWA — try it with `pnpm demo`
- 🟨 Next: deploy to MST testnet ([runbook](docs/runbooks/deploy-mst-testnet.md)), then Phase 5 — grievance/tender/integrity features
- 🎯 Target: production-ready pilot after the hardening and audit phase

## Delivery roadmap

The implementation is organized into 6 delivery phases over ~10 weeks
([overview](docs/phases/README.md), [full plan](docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md)):

1. [Foundation & rebrand](docs/phases/PHASE_1_FOUNDATION.md)
2. [Smart contracts v2 on MST testnet](docs/phases/PHASE_2_CONTRACTS.md)
3. [Data layer, indexer, and API](docs/phases/PHASE_3_BACKEND.md)
4. [Web app, wallets, and i18n](docs/phases/PHASE_4_WEB.md)
5. [Citizen features, integrity checks, anomaly v2](docs/phases/PHASE_5_FEATURES.md)
6. [Hardening, DevOps, audit, and pilot](docs/phases/PHASE_6_HARDENING.md)

### Buildathon focus

The key near-term checkpoint is a **testnet demo** (end of Phase 2) with a complete lifecycle
visible on the MST explorer:

- Project creation and approval
- Milestone creation and proof submission
- Multi-auditor approval
- Fund release event traceability

## Target architecture (high level)

- **Clients:** Citizen PWA + role-based web dashboards
- **Backend:** Express + TypeScript API, SIWE/OTP auth, relayer, indexer, anomaly engine
- **Data:** PostgreSQL (Drizzle), Redis, IPFS/Pinata
- **Blockchain:** MST EVM contracts for access, registry, escrow, grievances, tenders

## Repository layout

```
apps/
  api/            Express 5 + TypeScript API (@namma-seva/api)
  web/            React + Vite + shadcn/ui web app / PWA (@namma-seva/web)
packages/
  chain/          MST network config, explorer links, ABIs + deployments (Phase 2)
  i18n/           English, ಕನ್ನಡ, தமிழ், हिन्दी strings
  db/             Drizzle schema, migrations, seeds (read model)
  api-spec/       OpenAPI spec (contract-first) + Orval codegen
  api-zod/        Generated zod schemas
  api-client/     Generated React Query client
  contracts/      Hardhat project (Phase 2); legacy DecentraliTrack sources for reference
infra/
  compose/        docker-compose.dev.yml (Postgres, Redis)
  docker/         Dockerfiles + nginx.conf
docs/
  phases/         6-phase delivery plan
  adr/            Architecture decisions, incl. verified MST network facts
```

## MST networks

| | Testnet | Mainnet |
|---|---|---|
| Chain ID | 91562037 | 4646 |
| RPC | `https://testnetrpc.mstblockchain.com` | `https://mariorpc.mstblockchain.com` |
| Explorer | https://testnet.mstscan.com | https://mstscan.com |
| Coin | tMSTC | MSTC |
| Faucet | https://faucet.mstblockchain.com | — |

Contracts compile for `evmVersion: "shanghai"`: MST mainnet does not support Cancun opcodes yet
([ADR 0003](docs/adr/0003-evm-version-shanghai.md)).

## Try the demo (one command)

No Docker, wallet or SMS needed — a local chain, in-memory Postgres, the indexer, API and web app:

```bash
pnpm demo
```

Open http://localhost:5173/login and pick a role card: citizens (phone OTP shown on screen), ward
officials, auditors, contractors or the admin. Every card signs in with a burner wallet and sends
real transactions, so approvals, proofs, payments and grievances show up on every dashboard within
seconds ([ADR 0011](docs/adr/0011-demo-mode.md)).

## Getting started

Requires Node 22.13+ (`nvm use` reads `.nvmrc`) and pnpm 10.

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm dev
```

- Web: http://localhost:5173
- API health: http://localhost:3001/api/health

Local Postgres + Redis (needed for the API; full walkthrough in the [backend runbook](docs/runbooks/backend-local.md)):

```bash
pnpm infra:up
```

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | API (tsx watch) + web (Vite) in parallel |
| `pnpm typecheck` | Type-check shared packages and apps |
| `pnpm build` | Type-check, then build API bundle and web assets |
| `pnpm --filter @namma-seva/web ui:add <name>` | Add a shadcn/ui component |
| `pnpm i18n:check` | Fail if any language is missing a string |
| `pnpm test:contracts` | Contract tests (TypeScript + Solidity fuzz/invariant) |
| `pnpm test:api` | API + indexer tests (PGlite; chain e2e when a local node is up) |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / seed BBMP wards + departments |
| `pnpm indexer` | Run the chain indexer (separate process) |
| `pnpm chain:node` | Local Hardhat chain for development |
| `pnpm demo` | Whole stack locally with seeded demo data and role cards |
| `pnpm --filter @namma-seva/api-spec codegen` | Regenerate zod + client from OpenAPI |

### Adding UI components

The web app uses [shadcn/ui](https://ui.shadcn.com) (style `new-york`, Tailwind v4). Add
components through the wrapper, which also fixes a bad `cn` import in the upstream registry:

```bash
pnpm --filter @namma-seva/web ui:add <component>
```

## Contributing

Contributions should follow the [phase plan](docs/phases/README.md) and its Definition of Done, and prioritize:

- Security-first contract and backend changes
- Deterministic indexing and observability
- Accessibility and multilingual UX
- Test coverage and verification evidence

## Security

- `.env` is git-ignored — never commit keys.
- There are **no server-held role keys**. Officials, auditors and contractors sign their own
  transactions; the only server key is the relayer for gasless citizen actions. The API refuses to
  boot with any legacy `PRIVKEY_*` variable set.

## References

- MST developer docs: https://docs.mstblockchain.com/developer-docs
- Main implementation plan: [docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md](docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md)
- Architecture decisions: [docs/adr](docs/adr/README.md)

## License

MIT
