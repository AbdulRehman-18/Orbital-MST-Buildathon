# ADR 0001 — Web-only shadcn monorepo

- **Status:** Accepted · **Date:** 2026-09-28

## Context
DecentraliTrack (the reference codebase) is a Replit pnpm monorepo. Its catalog pins
`react: 19.1.0` "because expo requires it", and it carries Replit Vite plugins, a
`mockup-sandbox` app, a legacy Mongo backend and an empty `frontend/`. The Namma Seva plan
lists native mobile apps as a non-goal (§2.2).

## Decision
- Single pnpm workspace: `apps/{api,web}`, `packages/{chain,i18n,db,api-spec,api-zod,api-client,contracts}`.
- **Web only.** No Expo / React Native. Phones are served by a responsive, installable PWA (Phase 4).
- **UI = shadcn/ui** (`new-york`, Tailwind v4, CSS variables, `radix-ui`, `lucide-react`).
  Components are added with the shadcn CLI into `apps/web/src/components/ui` and owned by us.
- React is unpinned (`^19.2`). Replit tooling is not carried over.
- Keep pnpm `minimumReleaseAge: 1440` as a supply-chain guard.

## Consequences
- One UI system to maintain; no native build pipeline.
- Offline/camera features for contractors must work in a mobile browser (PWA + background sync).
- Legacy Solidity sources are kept read-only under `packages/contracts/legacy/` as input for Phase 2.
