# Phase 4 — Web App (shadcn), Wallets & i18n

**Duration:** Weeks 4–6 (runs in parallel with Phase 3) · **Depends on:** Phase 1 shell, Phase 2 ABIs; Phase 3 for live data · **Plan refs:** §11

## Goal
Deliver every role's web experience on the shadcn shell from Phase 1: wallet-signed flows for officials/auditors/contractors, a wallet-free citizen experience, four languages, installable PWA. Web-only — mobile is covered by responsive layouts and the PWA, not a native app.

## 1. Web3 layer
- [ ] **wagmi v2 + viem**; `mstTestnet` / `mstMainnet` via `defineChain` from `packages/chain`.
- [ ] Connectors: `injected` (MetaMask, BridgeKey extension), WalletConnect v2 (if BridgeKey supports it — per Phase 1 ADR).
- [ ] Wrong-network guard: shadcn `Alert` banner + button → `wallet_switchEthereumChain`, fallback `wallet_addEthereumChain` (Appendix B).
- [ ] `useTx()` hook: *Sign in wallet → Pending (n/6) → Confirmed ✓ [View on mstscan]*, driven by `sonner` toasts + a `Progress` indicator; posts `txHash` to `/api/tx/track`.
- [ ] Replace every `amoy.polygonscan.com` link with `VITE_NS_EXPLORER_URL`.
- [ ] Delete `src/abis/*.json` and `src/config/contracts.js`; import from `packages/chain`.

## 2. Shared components (built from shadcn primitives)
| Component | shadcn parts | Ported from |
|---|---|---|
| `NetworkStatusBar` — MST network, head block, indexer lag | `Badge`, `Tooltip`, `HoverCard` | `BlockchainStatusBar.tsx` |
| `ChainProofPanel` — tx/CID/hash + "Verify on chain" | `Card`, `Button`, `Collapsible` | `BlockchainProofPanel.tsx` |
| `StatusBadge` — project/milestone states (§7.2) incl. Pending/Confirmed | `Badge` variants | `status-badge.tsx` |
| `ProjectMap` — Leaflet + OSM | wrapped in `Card` | `project-map.tsx` |
| `TxButton` — wallet-signing button with states | `Button`, `Spinner` | new |
| `MilestoneTimeline` | `Card`, `Separator`, `Badge` | new |
| `ProofGallery` (IPFS, gateway fallback) | `Carousel`, `AspectRatio`, `Dialog` | new |
| `DataTable` (sort/filter/paginate) | `Table`, `Pagination`, `Input`, `DropdownMenu` | new |
| `AmountINR` — ₹ 12,34,567 grouping | — | new |
| `LanguageSwitcher` | `Select` / `DropdownMenu` | new |
| `ConnectWallet` / `OtpLogin` | `Dialog`, `InputOTP`, `Form` | `login.tsx` |

Forms use shadcn `Form` + `react-hook-form` + zod schemas from `packages/api-zod`.

## 3. Pages (§11.2)
| Route | Audience | Key shadcn building blocks |
|---|---|---|
| `/` | Everyone | Ward `Select`, `ProjectMap`, stat `Card`s, "How verification works" `Accordion` |
| `/ward/:wardId` | Everyone | spend charts (`Chart`/recharts), `DataTable`, CSV download |
| `/projects/:id` | Everyone | `Tabs` (Overview / Milestones / Proofs / Grievances / Ledger), `ChainProofPanel` |
| `/verify` | Everyone | `Input` for tx hash / project ID, QR scan, verified/mismatch `Alert` |
| `/citizen` | Citizen | `OtpLogin`, grievance form placeholder (filled in Phase 5) |
| `/official` | Official | create project/milestone `Sheet` forms, release `TxButton`, budget vs spent chart |
| `/contractor` | Contractor | mobile-first proof capture (camera, GPS lock), offline queue `Drawer` |
| `/subcontractor*` | Sub-contractor | existing confirm flow, re-pointed to new contracts |
| `/auditor` | Auditor | proof queue `DataTable`, proof-vs-project GPS map, M-of-N `Progress`, anomaly panel placeholder |
| `/tenders` | Everyone | tender board skeleton (flow filled in Phase 5) |
| `/ledger` (was `/blockchain-log`) | Everyone | live `DataTable` from indexer, filters by ward/contract/event |
| `/admin` | Admin | role proposals, relayer balance, indexer lag, contract addresses |

- [ ] Role-aware sidebar (shadcn `Sidebar`) driven by SIWE session role.
- [ ] Live updates via Socket.IO (port `use-live-updates.ts`) → TanStack Query invalidation.
- [ ] Loading = `Skeleton`, empty = `Empty`, errors = `Alert`.

## 4. i18n
- [ ] `packages/i18n` + `react-i18next`: **kn, ta, hi, en**; first-load language picker; persisted in `localStorage` (`ns_lang`).
- [ ] Indic web fonts (Noto Sans Kannada / Tamil / Devanagari) alongside the Latin font.
- [ ] CI check: every key exists in all 4 locales.

## 5. PWA & citizen UX
- [ ] `vite-plugin-pwa`: installable, offline cache of viewed projects, background sync for contractor proofs.
- [ ] QR sign-board generator for officials → `/projects/:id?src=board`, printable PDF.
- [ ] WhatsApp/SMS share of project status.
- [ ] Low-bandwidth mode (thumbnails only); ≥ 44 px touch targets; screen-reader labels.

## 6. Tests
- [ ] Vitest + React Testing Library for shared components.
- [ ] Playwright + Synpress (MetaMask) against local Hardhat: Official → Auditor ×2 → Contractor → Release.
- [ ] axe-core in Playwright.

## Deliverables
- Complete shadcn web app for all roles, wallet flows on MST, 4 languages, PWA.

## Exit criteria
- [ ] Playwright happy path green against local chain **and** MST testnet.
- [ ] Citizen can verify a project in < 3 taps without a wallet, in any of the 4 languages.
- [ ] Lighthouse mobile on `/projects/:id`: Performance ≥ 85, Accessibility ≥ 95.
