# Namma Seva

> **ನಮ್ಮ ಸೇವೆ · நம்ம சேவை · नम्मा सेवा — "Our Service"**
> Every rupee, on-chain. Every citizen, informed.

Namma Seva lets citizens see, verify and question how public money is spent on local
infrastructure — roads, drains, water supply, street lights. Every project, milestone, proof
photo, approval and payment is anchored on **MST Blockchain**, so records can't be silently
edited or deleted. Citizens don't need a crypto wallet; officials, auditors and contractors sign
with their own.

Built for the Orbital MST Buildathon, evolving the DecentraliTrack MVP (Polygon Amoy) onto MST.

## Status

**Phase 1 of 6 — Foundation & Rebrand.** See [docs/phases](docs/phases/README.md) for the roadmap
and [docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md](docs/NAMMA_SEVA_IMPLEMENTATION_PLAN.md) for the full plan.

## Repository layout

```
apps/
  api/            Express 5 + TypeScript API (@namma-seva/api)
  web/            React + Vite + shadcn/ui web app / PWA (@namma-seva/web)
packages/
  chain/          MST network config, explorer links, ABIs + deployments (Phase 2)
  i18n/           English, ಕನ್ನಡ, தமிழ், हिन्दी strings
  db/             Drizzle schema + migrations (Phase 3)
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

## Getting started

Requires Node 20+ and pnpm 10.

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

Local Postgres + Redis (needed from Phase 3):

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
| `pnpm --filter @namma-seva/api-spec codegen` | Regenerate zod + client from OpenAPI |

### Adding UI components

The web app uses [shadcn/ui](https://ui.shadcn.com) (style `new-york`, Tailwind v4). Add
components through the wrapper, which also fixes a bad `cn` import in the upstream registry:

```bash
pnpm --filter @namma-seva/web ui:add <component>
```

## Security

- `.env` is git-ignored — never commit keys.
- There are **no server-held role keys**. Officials, auditors and contractors sign their own
  transactions; the only server key is the relayer for gasless citizen actions (Phase 3).

## License

MIT
