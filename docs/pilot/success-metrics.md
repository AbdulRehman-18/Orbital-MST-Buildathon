# Success metrics (plan §2.3) — measured

Measured on **2026-09-29** against the local demo stack (Hardhat chain, PGlite, LEDGER mode) unless stated. Items marked ○ need the staging/testnet environment or a real CI runner and are wired to run there.

| Metric | Target | Result | How measured | Status |
|---|---|---|---|---|
| Contract test coverage | ≥ 95 % lines; 100 % of state transitions | **96.86 % lines / 96.93 % statements overall** (includes legacy compatibility contracts); **production contracts 98.6–100 %** — `MilestoneEscrow`, `ProjectRegistry`, `TenderRegistry`, `NammaSevaAccess`, `NammaSevaBase`, `NammaSevaMultisig` 100 %; `GrievanceRegistry` 98.55 % (one uncovered line, 246). 114 tests (9 fuzz/invariant, 105 unit/integration) pass | `pnpm --filter @namma-seva/contracts coverage` (also in CI, uploaded as an artifact) | ✔ |
| State-transition coverage | 100 % | project, milestone, grievance and tender state machines each have tests for every legal transition and the reverting illegal ones (`ProjectRegistry/MilestoneEscrow/GrievanceRegistry/TenderRegistry.test.ts`, `EscrowInvariants.t.sol`) | test review | ✔ |
| Indexer rebuild determinism | deterministic; matches DB checksum | **Identical checksum before and after two full rebuilds from the deployment block:** `423c7ce1c9bd28dec0c8f768809e8791` (12 tables, 140+ events) | `pnpm --filter @namma-seva/api indexer:checksum` → `indexer:rebuild` ×2 → checksum | ✔ |
| Citizen page Lighthouse (mobile) | Performance ≥ 85, Accessibility ≥ 95 | Accessibility: **axe reports 0 WCAG 2.1 A/AA violations** on all public pages in en/kn/ta/hi, dark theme, and four signed-in workspaces (56 e2e checks green, two consecutive runs). Performance: first-load JS+CSS **≈ 358 kB gzip** (budget 450 kB; map and dashboards lazy) — Lighthouse itself **could not run in the build sandbox** | `pnpm --filter @namma-seva/web e2e`; `lighthouse` job in `ci.yml` enforces perf ≥ 85 / a11y ≥ 95 on a GitHub runner | ◐ — the Lighthouse scores must come from the first CI run |
| Chain → UI latency | ≤ 10 s | **Definition needs a decision.** Default confirmations are 6 (ADR 0004): on ~3 s blocks a *confirmed* state reaches the dashboard in ≈ 18–21 s. The UI shows the optimistic **pending** state within ≈ 1 s (`/api/tx/track`, live socket) and flips to *confirmed* after the confirmations. To meet ≤ 10 s for *confirmed*, lower `CONFIRMATIONS` to 3 for the pilot (weaker reorg protection on a PoSA chain) | measure on testnet: run `pnpm --filter @namma-seva/contracts smoke:mst-testnet` while watching `GET /api/tx/<hash>` timestamps; record p50/p95 over ≥ 30 txs | ○ needs testnet |
| Critical/High audit findings open at mainnet | 0 | Static analysis: Slither 0 findings (Medium+ gate), Aderyn High = 4, all triaged as false positives and gated in CI. **External audit not yet done** | [`../security/audit-scope.md`](../security/audit-scope.md) | ○ blocked on audit |

## Phase 6 quality gates
| Gate | Target | Result | Status |
|---|---|---|---|
| Load | 500 concurrent readers, 20 tx/min | k6 script + thresholds written and syntax-checked (`tests/load/k6-load.js`); needs a staging run | ○ |
| Accessibility | axe clean + manual screen-reader pass, 4 languages | axe ✔; manual protocol in [`accessibility.md`](accessibility.md) | ◐ |
| Soak | 1 week on MST testnet staging | protocol in [`soak-test.md`](soak-test.md) | ○ |
| API tests | all green | **104** tests (auth, consent/erasure, transparency, metrics, KMS, retention, relayer, indexer, e2e chain) | ✔ |
| Web tests / e2e | all green | 16 unit + 56 Playwright | ✔ |
| Governance rehearsal | pause/rotation | automated in `Governance.test.ts` (12 tests) + live run of the owner CLI against a local chain | ✔ (human rehearsal ○) |

## Re-measuring
```bash
pnpm --filter @namma-seva/contracts coverage
NS_CHAIN=… DATABASE_URL=… pnpm --filter @namma-seva/api indexer:checksum && … indexer:rebuild && … indexer:checksum
pnpm demo &   # then
pnpm --filter @namma-seva/web e2e
```
