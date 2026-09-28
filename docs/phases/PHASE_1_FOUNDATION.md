# Phase 1 — Foundation & Rebrand

> **Status (2026-09-28):** ✅ engineering complete. Remaining items are marked **(You)** — they need wallet/key access.

**Duration:** Week 1 · **Depends on:** — · **Plan refs:** §3, §4, §6, §21

## Goal
A clean `namma-seva` monorepo in this repo that builds end-to-end, with a rebranded shadcn web shell and a shared MST chain package — no feature logic yet.

## 1. Repository layout
Port from DecentraliTrack, renamed per §6.1:

```
apps/
  api/            ← artifacts/api-server        (@namma-seva/api)
  web/            ← artifacts/decentralitrack   (@namma-seva/web)
packages/
  contracts/      ← decentralitrack/contracts   (Hardhat, TS)
  db/             ← lib/db                      (Drizzle)
  api-spec/       ← lib/api-spec                (OpenAPI)
  api-client/     ← lib/api-client-react        (Orval)
  api-zod/        ← lib/api-zod
  chain/          NEW — MST networks, ABIs, deployments, typed contracts
  i18n/           NEW — kn / ta / hi / en
infra/docker/, infra/compose/
docs/adr/, docs/runbooks/
```

- [x] `pnpm-workspace.yaml` with `apps/*`, `packages/*`; keep `minimumReleaseAge: 1440` supply-chain guard.
- [x] Carry over the pnpm `catalog:` but **unpin React** from `19.1.0` (Expo constraint no longer applies); drop `@replit/*` entries and the Expo ngrok overrides.
- [x] `tsconfig.base.json` + project references; root scripts `dev`, `build`, `typecheck`. *(`lint` / `test` land with ESLint + Vitest in Phase 3/4, when there is code to test.)*
- [x] Do **not** copy: `decentralitrack/backend`, `decentralitrack/frontend`, `artifacts/mockup-sandbox`, `bricklayer/`, `.local/`, `.replit*`, `replit.md`, `src/abis/*.json`.

## 2. Web shell (shadcn)
- [x] Vite + React + TypeScript app in `apps/web`, Wouter routing, TanStack Query.
- [x] `npx shadcn@latest init` → `components.json` (`style: new-york`, `baseColor: neutral`, `cssVariables: true`, aliases `@/components`, `@/components/ui`, `@/lib`, `@/hooks`).
- [x] Add base components: `button card badge input label select tabs table dialog sheet dropdown-menu tooltip sonner skeleton separator avatar sidebar breadcrumb alert accordion progress` via `pnpm --filter @namma-seva/web ui:add`. *(`form` deferred to Phase 4 with react-hook-form.)*
- [x] Theme tokens in `src/index.css` (Tailwind v4 `@theme inline`): civic **saffron** primary, **teal** accent, neutral surfaces; light + dark via a local `ThemeProvider` (shadcn's Vite recipe — `next-themes` triggers a React 19.2 script warning); primary/civic pairs are Tailwind orange-700 / teal-700 on white (≥ 5:1).
- [x] App layout: shadcn `Sidebar` (role nav) + top bar (language picker placeholder, network badge placeholder, theme toggle).
- [x] Brand: name **Namma Seva**, tagline *"Every rupee, on-chain. Every citizen, informed."*, logo, favicon, OG image, `index.html` meta.
- [x] Remove all Replit Vite plugins from `vite.config.ts`.

## 3. API shell
- [x] Express 5 + TS skeleton in `apps/api` (port structure from `artifacts/api-server/src`: `app.ts`, `index.ts`, `lib/logger.ts`, `routes/health.ts`).
- [x] `/api/health` only; pino logging with request IDs.

## 4. `packages/chain`
- [x] `networks.ts` with `MST_TESTNET` / `MST_MAINNET` / `LOCAL` (plan §9.1) — viem `defineChain`-compatible shape.
- [x] `explorer.ts` helpers: `txUrl(hash)`, `addressUrl(addr)`, `blockUrl(n)` → mstscan.
- [x] Placeholder `deployments/` + `abis/` (filled in Phase 2).

## 5. Environment & secrets
- [x] `.env.example` from plan Appendix A (`NS_*`, `MST_*`, `VITE_NS_*`); **no `PRIVKEY_*` role keys**.
- [x] `.gitignore` covers `.env*`, `deployments/localhost.json`, build output.
- [ ] **(You)** Rotate any keys that were used in the DecentraliTrack hackathon build.

## 6. MST verification & ADRs
- [ ] **(You)** Add MST Testnet to team wallets (Appendix B); fund deployer, relayer, 2 officials, 3 auditors, 2 contractors from the faucet.
- [x] Resolve the §21 questions against docs.mstblockchain.com **and the live RPCs** — 8 of 12 resolved; BridgeKey, deployer whitelisting, faucet allocation and grants need MST support (see `docs/adr/README.md`).
- [x] Record each answer as `docs/adr/000N-*.md`.

## 7. Local infra
- [x] `infra/compose/docker-compose.dev.yml`: Postgres 16 + Redis (local Hardhat node runs from `packages/contracts` once it exists in Phase 2).

## Deliverables
- Building monorepo; `pnpm dev` serves rebranded shadcn shell + API health.
- `packages/chain` with MST networks; ADRs for §21.

## Exit criteria
- [x] `pnpm install && pnpm build && pnpm typecheck` green from clean clone.
- [x] Web shell renders in light/dark and in all 4 languages with Namma Seva branding; no Replit/Expo deps installed (lockfile only lists drizzle-orm's optional `expo-sqlite` peer).
- [ ] **(You)** Team wallets hold tMSTC on MST testnet.
- [x] README rewritten for Namma Seva.
