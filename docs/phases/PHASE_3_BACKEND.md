# Phase 3 — Data Layer, Indexer & API

**Duration:** Weeks 4–5 · **Depends on:** Phase 2 · **Plan refs:** §5.1, §9, §10, §12

## Goal
Make the chain the source of truth and Postgres a rebuildable read model. Replace server-held role keys with wallet sign-in, and add a relayer for gasless citizens.

## 1. Database (`packages/db`)
DecentraliTrack's `lib/db/src/schema/index.ts` is empty — write it from scratch (Drizzle + Postgres 16):
- [ ] Tables per §12: `users, wards, departments, projects, milestones, milestone_approvals, grievances, tenders, bids, proof_media, chain_events, indexer_cursor, pending_txs, anomalies, otp_sessions, audit_log`.
- [ ] `chain_events` PK `(tx_hash, log_index)` for idempotency.
- [ ] `drizzle-kit` migrations; seeds for one city's wards (BBMP, names in en/kn/ta/hi) + departments.
- [ ] In-memory store from `api-server/src/data.ts` kept **only** behind `NS_DEMO_MODE=true`.

## 2. Chain config (`apps/api/src/chain/config.ts`)
Rewrite of `services/blockchainConfig.ts`:
- [ ] `NS_CHAIN=local|mstTestnet|mstMainnet` + `MST_RPC_URLS` (comma-separated) → `ethers.FallbackProvider` (quorum 1, stall 2 s).
- [ ] Startup guard: `getNetwork().chainId` must match, else refuse to boot.
- [ ] Addresses loaded from `packages/chain/deployments/<network>.json`.
- [ ] Only `RELAYER_PRIVATE_KEY` / `RELAYER_KMS_KEY_ID`; delete every `PRIVKEY_*`.

## 3. Indexer (`apps/api/src/indexer/`)
Replaces `services/blockchainListener.ts` (`contract.on()`) and `blockchainLogger.ts`:
- [ ] Loop every 3 s: `safeHead = head − CONFIRMATIONS(6)`, batched `getLogs` (adaptive `BATCH`, halve on RPC error), apply in one DB transaction ordered by `(block, logIndex)`, advance `indexer_cursor`.
- [ ] Projections for projects, milestones, approvals, grievances, tenders, bids.
- [ ] Reorg check via stored `last_block_hash`; roll back `REORG_DEPTH` and replay.
- [ ] Unconfirmed-head tracking for "Pending" badges; resolve `pending_txs`.
- [ ] Emit Socket.IO events (port `socket/server.ts`, `events.ts`) after commit.
- [ ] CLI `pnpm --filter api indexer:rebuild --from <deployBlock>`.
- [ ] Runs as singleton (Postgres advisory lock), separate process from API.

## 4. Auth (§10)
- [ ] SIWE (EIP-4361): `POST /api/auth/siwe/nonce`, `/siwe/verify`; message includes MST chain ID + domain; **role read from `NammaSevaAccess` on-chain**.
- [ ] Citizen phone OTP: `/api/auth/otp/send`, `/otp/verify` (MSG91/Twilio adapter); store `sha256(phone + pepper)` only.
- [ ] JWT (15 min) + httpOnly refresh cookie `ns_session`.
- [ ] Demo role cards only when `NS_DEMO_MODE=true`.

## 5. Relayer (§9.4)
- [ ] EIP-712 `ForwardRequest` → `TrustedForwarder` for grievance/upvote.
- [ ] `NonceManager` + Redis lock; BullMQ queue with retries and replace-by-nonce gas bump after 60 s.
- [ ] Per-phone rate limits; balance monitor (alert < 10 MSTC); daily spend cap.

## 6. API (contract-first)
- [ ] Update `packages/api-spec/openapi.yaml` **first**, then regenerate `api-zod` + `api-client` (Orval).
- [ ] Route deltas per §9.5: `POST /projects` (pin metadata → `{metaCID, metaHash}`), `POST /tx/track`, `POST /milestones/:id/proof/upload`, `GET /verify/:projectId`, `GET /chain/status`, `GET /public/export.csv`.
- [ ] **Remove** server-signed approve/reject/release routes; `contractService.ts` reduced to read helpers + relayer.
- [ ] Port `ipfsService.ts` (Pinata) — hardening comes in Phase 5.
- [ ] Cross-cutting: `helmet`, CORS allow-list, Redis-backed `express-rate-limit`, zod on every body, `/api/health` + `/api/ready` (DB + RPC + indexer lag < 60 s).

## 7. Tests
- [ ] Vitest + local Hardhat node: indexer idempotency, reorg simulation (`evm_snapshot`/`evm_revert`), **rebuild equals live DB checksum**.
- [ ] Vitest + Supertest + Testcontainers (Postgres, Redis): auth, validation, relayer queue.

## Deliverables
- Indexed Postgres read model, SIWE + OTP auth, relayer, updated OpenAPI + generated client.

## Exit criteria
- [ ] `indexer:rebuild` from deploy block produces an identical DB checksum.
- [ ] Event → DB ≤ 10 s on MST testnet.
- [ ] No private keys other than the relayer in any env/config.
- [ ] API integration tests green.
