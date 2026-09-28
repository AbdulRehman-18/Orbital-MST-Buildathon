# ADR 0010 — Indexer, live updates and citizen signing keys

- **Status:** Accepted · **Date:** 2026-09-28 · Implements plan §9.3, §9.4, §10 (Phase 3)

## Context
Phase 3 makes the chain the source of truth and Postgres a rebuildable read model, and lets
citizens act without a wallet. Several details were left open by the plan:
how the indexer (a separate process) reaches Socket.IO clients held by the API process, how
per-citizen keys are "derived, never exposed", and how integration tests run on machines without
Docker.

## Decision
- **Indexer = separate singleton process** (`dist/indexer.mjs`), guarded by a session-level
  `pg_try_advisory_lock(hashtext('namma-seva-indexer:<network>'))`. Each confirmed batch
  (events + projections + cursor) commits in one transaction; `chain_events (tx_hash, log_index)`
  plus "apply only when newly confirmed" makes replays idempotent.
- **Reorgs:** the stored hash of the last indexed block is re-checked every tick. On mismatch the
  indexer deletes events above `last − REORG_DEPTH` (default 64, ≥ the 12 in ADR 0004) and
  **replays projections from the stored events** (no RPC), then re-indexes forward.
  The unconfirmed head is mirrored as `confirmed = false` rows that are replaced every tick.
- **Live updates via Postgres `NOTIFY ns_chain`**: the indexer publishes after commit; the API
  `LISTEN`s and fans out to Socket.IO rooms (`ledger`, `project:<id>`, `tx:<hash>`). No extra
  broker; payloads are chunked under the 8 kB NOTIFY limit.
- **Citizen signing keys:** `HMAC-SHA256(relayerKey, "namma-seva/citizen-signer/v1" ‖ citizenHash)`,
  derived on demand, never stored or returned. The relayer registers each key once with
  `GrievanceRegistry.setCitizenSigner`, then submits EIP-712 `ForwardRequest`s through
  `TrustedForwarder`. This keeps the relayer key as the only server secret (exit criterion);
  when the relayer moves to KMS (Phase 6) the root becomes a KMS HMAC key.
  `citizenHash = sha256(E.164 phone + PHONE_HASH_PEPPER)` — the pepper must never change.
- **Relayer nonces:** a lock (Redis `SET NX PX`, in-memory without Redis) around
  `max(pending count, stored next nonce)` + broadcast; stuck txs are replaced at the same nonce
  with +25 % fees after `RELAYER_GAS_BUMP_AFTER_MS`. Jobs are simulated (inner call as the
  forwarder would make it, then the outer call) before any gas is spent.
- **Metadata hashing:** the API pins *canonical JSON* (keys sorted, no whitespace) as a file, and
  `metaHash = keccak256(those exact bytes)`, so anyone can re-hash the IPFS content.
- **Tests without Docker:** Postgres-backed tests use PGlite (in-process Postgres 17) with the real
  migrations; the chain suite runs against a local Hardhat node and skips when none is running.
  Testcontainers can replace PGlite in CI (Phase 6).

## Consequences
- `indexer:rebuild` and reorg recovery share one code path (`replayProjections`), and the tests
  assert rebuild checksum == live checksum on both a simulated and a real chain.
- PGlite multiplexes connections onto one backend, so **advisory-lock exclusion cannot be tested
  on PGlite** — verify the singleton on real Postgres before the pilot.
- Rotating the relayer key rotates every citizen signer; the new relayer must re-register signers
  (done lazily on the citizen's next action).
