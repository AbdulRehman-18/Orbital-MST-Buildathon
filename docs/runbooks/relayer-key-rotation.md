# Runbook — relayer key custody and rotation

The relayer is the only server-held key: it pays gas for citizens' grievances and upvotes and can only call the grievance registry through the trusted forwarder. It **cannot** touch projects, escrow or roles (`docs/security/phase-2-static-analysis.md`). Custody requirements (plan §16.2): KMS-held, daily spend cap, rotated quarterly.

## What lives where
| Secret | Where | Used for |
|---|---|---|
| Relayer **signing key** (secp256k1) | AWS KMS, `ECC_SECG_P256K1`, `SIGN_VERIFY` | signs gas-paying transactions (`RELAYER_KMS_KEY_ID`) |
| Citizen-key **HMAC key** | AWS KMS, `HMAC_256`, `GENERATE_VERIFY_MAC` | derives each citizen's signing key (`RELAYER_KMS_HMAC_KEY_ID`) |
| Phone-hash pepper | secret manager | one-way phone hash — **never rotate after launch** (`PHONE_HASH_PEPPER`) |

The private keys never enter the API process: the API calls KMS `Sign` (digest) and `GenerateMac`. On testnet a hot key (`RELAYER_PRIVATE_KEY`) is still accepted; the API **refuses to start on mainnet with a hot key**.

## One-time setup
1. Create the two KMS keys in the production account/region (`ap-south-1`), key policy: only the API task role may `Sign`, `GenerateMac`, `GetPublicKey`; no `Decrypt`/export; enable CloudTrail data events on both keys (audit trail of every signature).
2. Get the address and self-test:
   ```bash
   AWS_REGION=ap-south-1 pnpm --filter @namma-seva/api kms:address <signing-key-id> <hmac-key-id>
   ```
3. Grant `RELAYER_ROLE` to that address (before handover: `roles:mst-mainnet`; after: timelock proposal — see [role-rotation.md](role-rotation.md)).
4. Fund it ([Funding](#funding)). Set `RELAYER_KMS_KEY_ID`, `RELAYER_KMS_HMAC_KEY_ID`, `AWS_REGION` and deploy.

## Funding
- `RELAYER_DAILY_CAP` (default **50 MSTC**) is a hard stop: once the day's fees reach it, new gasless submissions pause until 00:00 UTC (`Gasless submissions are paused for today`).
- Keep **≥ 7 × the daily cap** in the wallet. Alerts: `RelayerLowBalance` (< 10 MSTC, warning), `RelayerBalanceCritical` (< 2 MSTC, page). Top up from the department treasury with a normal transfer — no code change.

## Quarterly rotation (signing key)
The relayer *address* changes; citizens' derived signing keys do **not** (they come from the HMAC key, not the signing key), so nothing needs re-registering.
1. Create the new KMS signing key; run `kms:address` for the new address.
2. Timelock: **grant** `RELAYER_ROLE` to the new address (48 h). Fund it.
3. When the grant executes, set `RELAYER_KMS_KEY_ID` to the new key and roll the API (one replica at a time; the Redis nonce lock is keyed by address so old and new don't collide).
4. Confirm a grievance end to end (staging first) and `tx_failures_total` stays flat.
5. Timelock: **revoke** the old address; drain any balance to treasury; schedule the old key for deletion (30-day KMS waiting period).

## HMAC key
Rotating the HMAC key changes every citizen's derived signer address. Citizens get a new signer registered automatically the next time they act, but **the previous signers stay authorised** on `GrievanceRegistry` until revoked. Treat this as rare (suspected compromise only):
1. Create the new HMAC key, switch `RELAYER_KMS_HMAC_KEY_ID`, roll the API.
2. Revoke the old signers: list them from the indexed `citizen_signers` table and call `setCitizenSigner(<old signer>, 0x00…00)` from the relayer for each (batch it; each is one cheap transaction).
3. Schedule the old HMAC key for deletion once every old signer is revoked.

A compromised HMAC key would let an attacker file *as* a citizen — bounded by the on-chain per-citizen daily limit and visible on the public ledger — but not touch funds, projects or roles.

## Compromise response
1. Revoke the KMS key's grant in IAM (immediate) — the API can no longer sign.
2. If needed, **pause** the system ([pause-and-resume.md](pause-and-resume.md)).
3. Rotate as above; the attacker's exposure is bounded by `RELAYER_DAILY_CAP` and the on-chain per-citizen limits.
4. File the CERT-In report within 6 hours ([incident-response.md](incident-response.md)).
