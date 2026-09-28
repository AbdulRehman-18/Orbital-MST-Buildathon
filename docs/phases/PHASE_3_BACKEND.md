# Phase 3 — Data Layer, Indexer & API

**Duration:** Weeks 4–5 · **Depends on:** Phase 2 · **Plan refs:** §5.1, §9, §10, §12

## Goal
Make the chain the source of truth and Postgres a rebuildable read model. Replace server-held role keys with wallet sign-in, and add a relayer for gasless citizens.

> **Status:** engineering complete on branch `phase-3-backend`; runs against a local chain.
> MST testnet run pending the Phase 2 testnet deploy. How to run: [backend runbook](../runbooks/backend-local.md).
> Design decisions: [ADR 0010](../adr/0010-backend-indexer-relayer.md).

## 1. Database (`packages/db`)
DecentraliTrack's `lib/db/src/schema/index.ts` is empty — write it from scratch (Drizzle + Postgres 16):
- [x] Tables per §12: `users, wards, departments, projects, milestones, milestone_approvals, grievances, tenders, bids, proof_media, chain_events, indexer_cursor, pending_txs, anomalies, otp_sessions, audit_log`.
      Added: `project_approvals`, `grievance_upvotes`, `account_roles`, `ward_access`, `citizen_signers` (projections), `auth_nonces`, `auth_sessions`, `pinned_metadata`, `relayer_txs` (off-chain).
      Approvals are keyed per review round (`milestone_id, round, auditor`) to match the contract (M-2).
- [x] `chain_events` PK `(tx_hash, log_index)` for idempotency.
- [x] `drizzle-kit` migrations; seeds for one city's wards (BBMP, names in en/kn/ta/hi) + departments.
      Starter subset of 13 wards — extend from the BBMP gazette and have translations reviewed before the pilot.
- [x] In-memory store from `api-server/src/data.ts` kept **only** behind `NS_DEMO_MODE=true`.
      Not ported (not in this repo); demo mode keeps demo role cards and may boot without a chain.

## 2. Chain config (`apps/api/src/chain/config.ts`)
Rewrite of `services/blockchainConfig.ts`:
- [x] `NS_CHAIN=local|mstTestnet|mstMainnet` + `MST_RPC_URLS` (comma-separated) → `ethers.FallbackProvider` (quorum 1, stall 2 s).
- [x] Startup guard: `eth_chainId` must match, else refuse to boot (also checks the manifest's chain id).
- [x] Addresses loaded from `packages/chain/deployments/<network>.json`.
- [x] Only `RELAYER_PRIVATE_KEY` / `RELAYER_KMS_KEY_ID`; every `PRIVKEY_*` is rejected at boot.

## 3. Indexer (`apps/api/src/indexer/`)
Replaces `services/blockchainListener.ts` (`contract.on()`) and `blockchainLogger.ts`:
- [x] Loop every 3 s: `safeHead = head − CONFIRMATIONS(6)`, batched `getLogs` (adaptive `BATCH`, halve on RPC error), apply in one DB transaction ordered by `(block, logIndex)`, advance `indexer_cursor`.
- [x] Projections for projects, milestones, approvals, grievances, tenders, bids (+ roles, ward access, citizen signers).
- [x] Reorg check via stored `last_block_hash`; roll back `REORG_DEPTH` and replay.
- [x] Unconfirmed-head tracking for "Pending" badges; resolve `pending_txs`.
- [x] Emit Socket.IO events (port `socket/server.ts`, `events.ts`) after commit — via Postgres `NOTIFY` from the indexer process.
- [x] CLI `pnpm --filter @namma-seva/api indexer:rebuild --from <deployBlock>` (+ `indexer:checksum`).
- [x] Runs as singleton (Postgres advisory lock), separate process from API.

## 4. Auth (§10)
- [x] SIWE (EIP-4361): `POST /api/auth/siwe/nonce`, `/siwe/verify`; message includes MST chain ID + domain; **role read from `NammaSevaAccess` on-chain** (re-read on every refresh).
- [x] Citizen phone OTP: `/api/auth/otp/send`, `/otp/verify` (MSG91/Twilio adapter, `console` for dev); store `sha256(phone + pepper)` only.
- [x] JWT (15 min) + httpOnly refresh cookie `ns_session` (rotated on use).
- [x] Demo role cards only when `NS_DEMO_MODE=true`.

## 5. Relayer (§9.4)
- [x] EIP-712 `ForwardRequest` → `TrustedForwarder` for grievance/upvote, signed by derived per-citizen keys.
- [x] Nonce lock (Redis `SET NX`) + BullMQ queue with retries and replace-by-nonce gas bump after 60 s.
      Uses a lock around `max(pending count, stored next nonce)` instead of `ethers.NonceManager`, which is per-process only.
- [x] Per-phone rate limits; balance monitor (alert < 10 MSTC); daily spend cap.

## 6. API (contract-first)
- [x] Update `packages/api-spec/openapi.yaml` **first**, then regenerate `api-zod` + `api-client` (Orval).
- [x] Route deltas per §9.5: `POST /projects` (pin metadata → `{metaCID, metaHash}`), `POST /tx/track`, `POST /milestones/:id/proof/upload`, `GET /verify/:projectId`, `GET /chain/status`, `GET /public/export.csv`.
      Also: `GET/POST /grievances`, `/grievances/:id/upvote`, `/relay/jobs/:id`, `/tenders`, `/ledger`, `/metadata`, `/wards`, `/departments`, `/anomalies`.
- [x] **Remove** server-signed approve/reject/release routes (not carried over; the API only reads contracts and relays citizen actions).
- [x] Port `ipfsService.ts` (Pinata) — hardening comes in Phase 5. Dev fallback: in-memory store with real CIDv1s.
- [x] Cross-cutting: `helmet`, CORS allow-list, Redis-backed `express-rate-limit`, zod on every body, `/api/health` + `/api/ready` (DB + RPC + indexer lag < 60 s).

## 7. Tests
- [x] Vitest + local Hardhat node: indexer idempotency, reorg simulation (`evm_snapshot`/`evm_revert`), **rebuild equals live DB checksum** (`test/e2e.chain.test.ts`, plus a deterministic fake-chain suite in `test/indexer.test.ts`).
- [~] Vitest + Supertest + ~~Testcontainers~~ **PGlite** (Postgres): auth, validation, relayer queue. Docker was unavailable; Redis-backed paths (BullMQ, Redis lock/rate-limit store) are not covered by automated tests yet.

## Deliverables
- Indexed Postgres read model, SIWE + OTP auth, relayer, updated OpenAPI + generated client.

## Exit criteria
- [x] `indexer:rebuild` from deploy block produces an identical DB checksum (asserted on fake chain and local Hardhat).
- [ ] Event → DB ≤ 10 s on MST testnet. *Pending testnet deploy; by design ≈ 6 × 3 s + one 3 s poll ≈ 21 s at CONFIRMATIONS=6 — the "Pending" mirror covers the gap. Revisit the target or lower confirmations after measuring.*
- [x] No private keys other than the relayer in any env/config the API reads (`DEPLOYER_PRIVATE_KEY` remains for `packages/contracts` only and is rejected by the API in production).
- [x] API integration tests green (38 tests: 36 on PGlite + fake chain, 2 on a local Hardhat node).
