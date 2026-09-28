# Phase 1 — Foundation & Rebrand

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

- [ ] `pnpm-workspace.yaml` with `apps/*`, `packages/*`; keep `minimumReleaseAge: 1440` supply-chain guard.
- [ ] Carry over the pnpm `catalog:` but **unpin React** from `19.1.0` (Expo constraint no longer applies); drop `@replit/*` entries and the Expo ngrok overrides.
- [ ] `tsconfig.base.json` + project references; root scripts `dev`, `build`, `typecheck`, `lint`, `test`.
- [ ] Do **not** copy: `decentralitrack/backend`, `decentralitrack/frontend`, `artifacts/mockup-sandbox`, `bricklayer/`, `.local/`, `.replit*`, `replit.md`, `src/abis/*.json`.

## 2. Web shell (shadcn)
- [ ] Vite + React + TypeScript app in `apps/web`, Wouter routing, TanStack Query.
- [ ] `npx shadcn@latest init` → `components.json` (`style: new-york`, `baseColor: neutral`, `cssVariables: true`, aliases `@/components`, `@/components/ui`, `@/lib`, `@/hooks`).
- [ ] Add base components: `button card badge input label form select tabs table dialog sheet dropdown-menu tooltip sonner skeleton separator avatar sidebar breadcrumb`.
- [ ] Theme tokens in `src/index.css` (Tailwind v4 `@theme inline`): civic **saffron** primary, **teal** accent, neutral surfaces; light + dark via `next-themes`; verify WCAG AA contrast.
- [ ] App layout: shadcn `Sidebar` (role nav) + top bar (language picker placeholder, network badge placeholder, theme toggle).
- [ ] Brand: name **Namma Seva**, tagline *"Every rupee, on-chain. Every citizen, informed."*, logo, favicon, OG image, `index.html` meta.
- [ ] Remove all Replit Vite plugins from `vite.config.ts`.

## 3. API shell
- [ ] Express 5 + TS skeleton in `apps/api` (port structure from `artifacts/api-server/src`: `app.ts`, `index.ts`, `lib/logger.ts`, `routes/health.ts`).
- [ ] `/api/health` only; pino logging with request IDs.

## 4. `packages/chain`
- [ ] `networks.ts` with `MST_TESTNET` / `MST_MAINNET` / `LOCAL` (plan §9.1) — viem `defineChain`-compatible shape.
- [ ] `explorer.ts` helpers: `txUrl(hash)`, `addressUrl(addr)`, `blockUrl(n)` → mstscan.
- [ ] Placeholder `deployments/` + `abis/` (filled in Phase 2).

## 5. Environment & secrets
- [ ] `.env.example` from plan Appendix A (`NS_*`, `MST_*`, `VITE_NS_*`); **no `PRIVKEY_*` role keys**.
- [ ] `.gitignore` covers `.env*`, `deployments/localhost.json`, build output.
- [ ] Rotate any keys that were used in the DecentraliTrack hackathon build.

## 6. MST verification & ADRs
- [ ] Add MST Testnet to team wallets (Appendix B); fund deployer, relayer, 2 officials, 3 auditors, 2 contractors from the faucet.
- [ ] Resolve the §21 questions against docs.mstblockchain.com — at minimum: EVM version (`paris` vs `shanghai`), `eth_getLogs` range limit, finality/confirmations, Blockscout verify API path, EIP-1559 vs legacy gas, BridgeKey provider.
- [ ] Record each answer as `docs/adr/000N-*.md`.

## 7. Local infra
- [ ] `infra/compose/docker-compose.dev.yml`: Postgres 16 + Redis + Hardhat node.

## Deliverables
- Building monorepo; `pnpm dev` serves rebranded shadcn shell + API health.
- `packages/chain` with MST networks; ADRs for §21.

## Exit criteria
- [ ] `pnpm install && pnpm build && pnpm typecheck` green from clean clone.
- [ ] Web shell renders in light/dark with Namma Seva branding; no Replit/Expo deps in the lockfile.
- [ ] Team wallets hold tMSTC on MST testnet.
- [ ] README rewritten for Namma Seva.
