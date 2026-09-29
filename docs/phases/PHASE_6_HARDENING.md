# Phase 6 — Hardening, DevOps & Pilot

**Duration:** Weeks 8–10 · **Depends on:** Phase 5 · **Plan refs:** §8.4, §16, §17, §18, §20

## Goal
Make the system safe to run with real public data: security review, compliance, CI/CD, monitoring, a one-ward pilot on MST testnet, then a gated mainnet launch.

> **Status (2026-09-29): engineering complete; organisational gates open.** Everything that can be built, tested and rehearsed inside the repository is done and evidenced (✅). Items marked ⏳ need something outside the repo — an audit firm, a hardware-wallet ceremony, counsel, the Authority, real owners — and are tracked in [`docs/pilot/mainnet-go-no-go.md`](../pilot/mainnet-go-no-go.md). **Mainnet is NO-GO until they close.** Design decisions: [ADR 0012](../adr/0012-hardening-and-compliance.md).

## 1. Security
- [x] ✅ Slither + Aderyn in CI (Slither fails on Medium+; Aderyn fails on any **un-triaged** High via `scripts/aderynGate.mjs`) — `.github/workflows/ci.yml`, `security.yml`
- [x] ✅ OWASP ZAP baseline workflow against staging (`security.yml`, manual input; rules in `infra/zap/rules.tsv`)
- [ ] ⏳ External smart-contract audit (2–3 weeks; **start at the beginning of the phase**) — scope and hand-off pack ready: [`docs/security/audit-scope.md`](../security/audit-scope.md); fix all Critical/High
- [x] ✅ OWASP ASVS L2 checklist for the API: [`docs/security/asvs-l2-checklist.md`](../security/asvs-l2-checklist.md) (open items listed); `pnpm audit --audit-level high`, dependency-review and Dependabot in CI/`dependabot.yml`
- [ ] ⏳ Socket.dev — needs an org token; optional, add the action when available
- [x] ✅ Nginx CSP + full security-header set (no inline scripts), upload size/type limits (10 MB × 5, 55 MB body cap on the upload route only), image re-encode confirmed (sharp) — `infra/docker/nginx.conf.template`
- [x] ✅ Emergency `pause()` + role rotation **rehearsed**: automated in `Governance.test.ts` (12 tests) and run live with the owner CLI; **found and fixed a design gap** (only the timelock held PAUSER → a 48 h "emergency" pause) — multisig now holds PAUSER too (ADR 0012 §1). Human rehearsal with the real owners: ⏳ [`rehearsal-log.md`](../pilot/rehearsal-log.md)
- [ ] ⏳ Independent web/API penetration test (ZAP is a baseline, not a substitute)

## 2. Keys (§16.2)
- [x] ✅ Deployer = hardware wallet: mainnet network uses `DEPLOYER_MODE=hardware` (Frame, `accounts: "remote"`); `deploy.ts` mainnet guards; runbook [`deploy-mst-mainnet.md`](../runbooks/deploy-mst-mainnet.md). Ceremony itself: ⏳
- [x] ✅ ADMIN → 3-of-5 `NammaSevaMultisig` (MST has no Safe, ADR 0006) + 48 h timelock; deployer renounces (`handover.ts`); owner CLI `scripts/multisig.ts`; multisig also holds PAUSER for an instant stop
- [x] ✅ Relayer via **KMS**: AWS KMS secp256k1 signing key + HMAC key for citizen keys (`KmsSigner`, `KmsCitizenKeys`), refused-hot-key guard on mainnet, daily spend cap (existing), quarterly rotation runbook — [`relayer-key-rotation.md`](../runbooks/relayer-key-rotation.md). Creating the production KMS keys: ⏳ Ops

## 3. Compliance (India)
- [x] ✅ DPDP Act 2023: consent notice at OTP login in the user's language (server-enforced, versioned, recorded), purpose limitation, **access/erase** for off-chain data (`/api/me/data`, citizen dashboard tab), grievance-officer contact; **no PII on-chain** — [`docs/compliance/dpdp.md`](../compliance/dpdp.md). Counsel approval of the text: ⏳
- [x] ✅ Privacy policy + terms in kn/ta/hi/en (`/privacy`, `/terms`) and the consent step at citizen login (**draft** — counsel review ⏳)
- [x] ✅ CERT-In: 6-hour incident procedure ([`incident-response.md`](../runbooks/incident-response.md), report template) and **180-day log retention enforced in code** (`retention.ts`, `AUDIT_LOG_RETENTION_DAYS` ≥ 180) — [`cert-in.md`](../compliance/cert-in.md). Shipping container logs to India-resident storage: ⏳ Ops
- [x] ✅ GIGW 3.0 self-assessment — [`gigw-3.0-checklist.md`](../compliance/gigw-3.0-checklist.md); open items listed (hosting, VAPT, accessibility statement)
- [ ] ⏳ Written MoU / pilot approval from the ward / ULB — [template](../compliance/pilot-mou-template.md)

## 4. CI/CD (§18.2)
- [x] ✅ `ci.yml`: install → typecheck + i18n → contracts test + opcode guard + coverage → Slither → API tests → web tests + build + bundle budget → Lighthouse (mobile) → **Playwright e2e + axe on the Hardhat demo stack** → Docker builds + Nginx config test
- [x] ✅ `deploy-dev.yml`: on `main` → build images → push GHCR → roll the dev environment (compose over SSH, readiness-gated)
- [x] ✅ `deploy-contracts.yml`: manual dispatch, network input → deploy (testnet) → verify → publish addresses → PR with manifests (**mainnet deploy is refused in CI on purpose**: hardware wallet)
- [x] ✅ Environments: `local` (Hardhat) · `dev` + `staging` (MST testnet, separate deployments) · `prod` (MST mainnet) — GitHub environments named in the workflows; ⏳ create them with required reviewers and secrets
- [x] ✅ `restore-drill.yml` (weekly), `dependabot.yml`

## 5. Runtime & observability
- [x] ✅ Images `namma-seva-api`, `namma-seva-indexer` (same image, `indexer.mjs run`), `namma-seva-web` (Nginx static, CSP env-templated); production compose adds Redis, Postgres, migrate step, backups, and the observability profile — `infra/compose/docker-compose.prod.yml`
- [x] ✅ Prometheus metrics `indexer_lag_blocks`, `relayer_balance`, `tx_failures_total`, `rpc_latency_ms` (+ HTTP); Grafana dashboard; alert rules; Alertmanager → Slack/email — [`monitoring.md`](../runbooks/monitoring.md). Wiring real webhook/SMTP: ⏳ Ops
- [x] ✅ Nightly Postgres backup + **weekly restore test** (script + workflow); chain rebuild as last resort (`indexer:rebuild`, determinism verified) — [`backup-restore.md`](../runbooks/backup-restore.md)
- [x] ✅ Runbooks in `docs/runbooks/`: upgrade, pause/resume, role rotation, relayer key rotation, incident response, backup/restore, monitoring, mainnet deploy

## 6. Quality gates
- [x] ✅ k6 load script (500 concurrent readers, 20 tx/min writes) with pass/fail thresholds — `tests/load/`. Staging **run**: ⏳ ([results template](../pilot/load-test-results.md))
- [x] ✅ Accessibility: **axe clean** on all public pages × 4 languages, dark theme and 4 workspaces (56 e2e checks) — real defects found and fixed (contrast, progressbar names). Manual screen-reader pass ⏳ ([protocol](../pilot/accessibility.md))
- [ ] ⏳ 1-week staging soak on MST testnet ([protocol](../pilot/soak-test.md))

## 7. Pilot & mainnet
- [ ] ⏳ Pilot one ward (ledger mode): 1 official, 2–3 auditors, 2 contractors, 3–5 real projects — [plan](../pilot/pilot-plan.md)
- [x] ✅ Public **Transparency** page listing verified contract addresses, admin custody, timelock/multisig, emergency-stop holders, audit link, grievance officer, and the **PoSA trust-assumption disclosure** (`/transparency`, `GET /api/transparency`)
- [ ] ⏳ Mainnet go/no-go (§8.4) — [checklist](../pilot/mainnet-go-no-go.md): audit closed, multisig + timelock live, relayer funded with cap, runbooks rehearsed
- [ ] ⏳ Deploy + verify on mstscan.com; publish addresses in repo (`publish-addresses:*` script) and on the site

## UI alignment (added in this phase)
The web app was re-skinned to the DecentraliTrack reference design (paper background, ink pill buttons, blue→teal brand, Outfit + Fraunces, floating top nav, hairline stat grids) with design tokens, so every shadcn component and every page inherits it. See ADR 0012 §11.

## Deliverables
- Hardened contracts and tooling (audit ⏳), CI/CD, monitoring, runbooks, a Transparency page, compliance package — ✅. Live ward pilot and mainnet deployment — ⏳ (need the organisational inputs above).

## Exit criteria
- [ ] 0 open Critical/High findings — ⏳ blocked on the external audit
- [ ] Pilot live; contracts verified on mstscan.com; Transparency page published — page ✅; pilot and mainnet ⏳
- [ ] All §2.3 success metrics measured and met — measured: coverage ✅ 96.9 % (prod contracts 98.6–100 %), rebuild determinism ✅, axe ✅; ◐ Lighthouse (CI job added; sandbox could not run it), ○ chain→UI latency (needs testnet; conflicts with the 6-confirmation default — decision needed), ○ audit — see [`success-metrics.md`](../pilot/success-metrics.md)
