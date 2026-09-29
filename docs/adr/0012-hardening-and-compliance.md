# ADR 0012 — Phase 6 hardening: custody, emergency stop, privacy, observability

- **Status:** Accepted · **Date:** 2026-09-29 · Plan §8.4, §16, §17, §18

## Context
Phases 1–5 produced a working system on a testnet with a single admin wallet and a hot relayer key.
Phase 6 makes it safe to run with real public data: key custody, incident response, Indian
compliance (DPDP, CERT-In), operations and a pilot. Several decisions were forced by what building
and rehearsing it revealed.

## Decisions
1. **Emergency stop must not wait for the timelock.** After `handOverAdmin` only the *timelock* held
   PAUSER, so an emergency `pause()` would have been scheduled through the 48 h delay — worthless in
   an incident, and only visible once we wrote the rehearsal test. The **multisig now also holds
   PAUSER** (3-of-5, instant). `unpause` stays ADMIN-only (timelock), so resuming is deliberately
   slow. No contract change: `handOverAdmin(access, timelock, deployer, guardian)` grants the extra role.
   `packages/contracts/test/Governance.test.ts` proves pause is immediate, unpause is timelocked, and
   the old deployer key is powerless.
2. **Owners operate the multisig with a CLI** (`scripts/multisig.ts`), because MST has no Safe UI
   (ADR 0006). It encodes calls for any registry, wraps them for the timelock, and prints the salt.
3. **Relayer keys live in KMS.** A small `KmsClient` interface (`getPublicKey`, `sign`, `generateMac`)
   with an AWS KMS implementation loaded lazily; `KmsSigner` is an ethers `AbstractSigner`
   (DER→low-s→recovery-id, verified against the key's own address). Citizen signing keys derive from a
   KMS **HMAC** key with the same message format as the local derivation (a test proves equality), so
   no derivation secret enters the API process. Mainnet refuses a hot `RELAYER_PRIVATE_KEY`; testnet
   still accepts one. Vault transit was rejected: it has no secp256k1 signing.
4. **Mainnet deployer = hardware wallet through Frame** (`accounts: "remote"` + local RPC), not a
   Ledger transport plugin (native USB modules in the build). `deploy.ts` refuses mainnet unless there
   are ≥ 5 distinct owners, threshold ≥ 3, timelock ≥ 48 h, a real treasury, and the deployer is not an owner.
5. **Consent is enforced by the server, versioned, and recorded.** OTP send/verify require the current
   `consentVersion`; the API stores one `consents` row per version/language/time (no phone data).
   Erasure deletes the account, consents, sessions and OTP state and unlinks operational rows; the
   anonymous citizen hash that is already on-chain stays, and becomes unlinkable because the pepper is secret
   and no table maps it to a person any more. Children are out of scope for the pilot (adults only) — a verifiable
   parental-consent flow is not built.
6. **Retention is code, not policy.** A daily job purges expired OTP/nonce/session rows and audit logs
   older than `AUDIT_LOG_RETENTION_DAYS` (default and minimum 180, CERT-In).
7. **Metrics are hand-rolled Prometheus text** (no dependency), served at `/metrics` **outside `/api`**
   so the public Nginx cannot route it, behind a bearer token (off entirely in production without one).
   The four alerting signals: `indexer_lag_blocks`, `relayer_balance`, `tx_failures_total`, `rpc_latency_ms`.
8. **CSP without `unsafe-inline` scripts.** The theme bootstrap moved to `/theme-init.js`. Styles need
   `style-src-attr 'unsafe-inline'` (React inline style attributes, Leaflet). Allow-lists for RPC and the
   IPFS gateway are Nginx env-templated per environment. Nginx never uses `add_header` inside a location
   (it would silently drop the security headers).
9. **Public trust report from chain + index.** `/api/transparency` classifies admin custody (single wallet /
   multisig+timelock / unknown) from indexed role events, each confirmed on-chain, and lists the PAUSER
   holders. An ambiguous state (≠ exactly one ADMIN) reports UNKNOWN rather than guessing.
10. **CI choices.** API tests use PGlite (real Postgres in WASM) instead of Testcontainers — same SQL and
    migrations, no Docker in unit CI; a Docker job builds both images and validates the Nginx template.
    There is no ESLint config: strict TypeScript everywhere is the lint gate. Lighthouse CI enforces the
    plan's mobile targets. The ZAP baseline runs on demand against staging.
11. **UI language follows the DecentraliTrack reference** (paper background, ink pill buttons, blue→teal
    brand, Outfit + Fraunces, floating header, hairline stat grids), re-expressed as design tokens so every
    shadcn component inherits it. The sidebar shell was removed; light is the default theme.

## Consequences
- The governance model has two power levels: fast **stop** (3-of-5), slow **everything else** (3-of-5 + 48 h).
- A KMS outage stops gasless citizen actions (reads and all role-holder actions are unaffected).
- Erasure is honest but bounded by immutability; counsel must approve the wording (`docs/compliance/dpdp.md`).
- Success metric "chain → UI ≤ 10 s" conflicts with ADR 0004's 6 confirmations (≈ 18 s on ~3 s blocks):
  the UI shows the optimistic *pending* state immediately and *confirmed* after the confirmations. Decide with the
  Authority whether to accept that definition or lower confirmations on the pilot (`docs/pilot/success-metrics.md`).
