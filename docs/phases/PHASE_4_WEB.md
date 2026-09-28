# Phase 4 — Web App (shadcn), Wallets & i18n

**Duration:** Weeks 4–6 (runs in parallel with Phase 3) · **Depends on:** Phase 1 shell, Phase 2 ABIs; Phase 3 for live data · **Plan refs:** §11

## Goal
Deliver every role's web experience on the shadcn shell from Phase 1: wallet-signed flows for officials/auditors/contractors, a wallet-free citizen experience, four languages, installable PWA. Web-only — mobile is covered by responsive layouts and the PWA, not a native app.

> **Status:** engineering complete on branch `phase-4-web` (built on `phase-3-backend`), verified in the
> browser against a local chain with `pnpm demo`. Open items are marked below.
> Demo design: [ADR 0011](../adr/0011-demo-mode.md).

## 1. Web3 layer
- [x] **wagmi + viem** (wagmi **v3**, current major; v2 when the plan was written); chain from `packages/chain` via `defineChain`.
- [x] Connectors: `injected` (MetaMask, BridgeKey extension, EIP-6963 discovery) + a demo **burner** connector (NS_DEMO_MODE only). WalletConnect v2 deferred until BridgeKey mobile support is confirmed (§21 Q8).
- [x] Wrong-network guard: banner + button → `switchChain` (wagmi falls back to `wallet_addEthereumChain`).
- [x] `useChainTx()`: *Confirm in wallet → Pending → Recorded on-chain ✓ [View tx]* toasts; posts `txHash` to `/api/tx/track`; decodes custom revert errors (e.g. `AlreadyApproved`).
- [x] Explorer links from `VITE_NS_EXPLORER_URL` / network config (none on a local chain).
- [x] ABIs and addresses come from `packages/chain` + `/api/chain/status`; no per-app ABI copies.

## 2. Shared components (built from shadcn primitives)
- [x] `NetworkBadge` (head block, indexer lag, live-socket state) · `VerifyButton`/`VerifyResultView` · `StatusBadge` + `PendingBadge`
- [x] `ProjectMap` (Leaflet + OSM, status-coloured markers, popups, "near me"), `GpsDiffMap` (site vs proof), `LocationPicker`
- [x] `MilestoneTimeline`, `ProofGallery` (IPFS, gateway-aware), `GrievanceCard`, `FileGrievanceDialog`, `ActionDialog`
- [x] `Amount` (₹ Indian grouping + lakh/crore; ESCROW mode shows native coin), `AddressLink`, `TxLink`, `StatCard`, `EmptyState`
- [ ] Forms use plain controlled inputs + generated api-zod validation on the server, not `react-hook-form` (deferred; no user-facing gap).

## 3. Pages (§11.2)
- [x] `/` — stats, ward filter, project map, "How verification works", demo CTA
- [x] `/ward/:wardId` — ward stats, map, projects, grievances, **CSV download**
- [x] `/projects`, `/projects/:id` — list/map, tabs (Overview / Milestones / Grievances / On-chain log), **Verify on chain**, QR sign-board, WhatsApp share
- [x] `/verify` — project ID or tx hash → field-by-field chain comparison / events in the tx
- [x] `/citizen` — map + near me, my grievances, raise a grievance (gasless via relayer), upvote
- [x] `/official` — create project (map location picker, pinned metadata → `createProject`), sanction funds (PFMS ref / native), add milestones, release payments (UTR), publish tender, assign contractor, close
- [x] `/contractor` — assigned works, camera/GPS proof capture → upload → `submitProof`, open tenders
- [x] `/auditor` — approve/reject projects, proof review with GPS diff map + M-of-N, respond to grievances (pause/dismiss), resume paused projects
- [x] `/tenders` — tender board (commit/reveal phases); bidding UI is Phase 5
- [x] `/ledger` — indexed events, contract filter, unconfirmed toggle, paging
- [x] `/admin` — health (DB/RPC/indexer), relayer balance & spend, contracts, role holders, grant/revoke roles
- [ ] `/subcontractor*` — not carried over (no sub-contractor role in the v2 contracts yet).
- [x] **Role-scoped sidebar**: each signed-in user sees only their own workspace; other dashboards show a role gate.
- [x] Live updates via Socket.IO → TanStack Query invalidation.
- [x] Loading = `Skeleton`, empty = `EmptyState`, errors = `Alert` / toasts.

## 4. i18n
- [x] kn / ta / hi / en for every string (397 keys × 4, `pnpm i18n:check`), persisted as `ns_lang`; ward names localized.
- [x] Indic web fonts (Noto Sans Kannada / Tamil / Devanagari).
- [ ] First-load language picker (the switcher is always in the header; a first-visit prompt is still open).

## 5. PWA & citizen UX
- [x] `vite-plugin-pwa`: installable, precached shell, runtime cache of public project data, IPFS content and map tiles.
- [ ] Background sync for contractor proofs (uploads need the wallet signature right after; needs an offline queue design).
- [x] QR sign-board code → `/projects/:id?src=board` (printable).
- [x] WhatsApp share of project status.
- [ ] Low-bandwidth mode (thumbnails only).
- [x] Responsive down to 360 px (no horizontal page scroll; dialogs scroll within the viewport); screen-reader labels on icon buttons.

## 6. Tests
- [x] Vitest + React Testing Library: amounts/INR formatting, role-scoped nav, i18n rendering in 4 languages.
- [x] API: proof upload, demo endpoints, signed-in citizen views (regression for an array-parameter bug found in the browser).
- [ ] Playwright + Synpress (MetaMask) E2E and axe-core — not started. Manual browser run of every role against `pnpm demo` done instead (see below).

## Verified by hand (pnpm demo, in-browser)
Official releases a payment → auditor approves proof (2-of-2) → citizen files a gasless grievance → contractor uploads a
photo and submits proof → admin console shows health/relayer/roles → Kannada UI; each change reached every dashboard via
the indexer within seconds. A chain revert under the live indexer was handled as a reorg.

## Exit criteria
- [ ] Playwright happy path green against local chain **and** MST testnet.
- [x] Citizen can verify a project in < 3 taps without a wallet, in any of the 4 languages (Projects → project → Verify on chain).
- [ ] Lighthouse mobile on `/projects/:id`: Performance ≥ 85, Accessibility ≥ 95 — not measured yet (routes are code-split; web3/map vendors in separate chunks).
