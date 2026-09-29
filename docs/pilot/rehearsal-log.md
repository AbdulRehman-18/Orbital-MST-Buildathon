# Rehearsal log

Rehearse every runbook with the **real people** on staging (MST testnet) before the pilot goes public and before mainnet. Time each step. A rehearsal that was not timed and signed did not happen.

## Automated evidence (CI)
`packages/contracts/test/Governance.test.ts`, "emergency pause and role rotation (rehearsal, plan §16.2)":
- 3 of 5 owners pause the whole system with **no** delay; a single owner cannot; every state-changing entry point then reverts.
- Resuming is ADMIN-only, so it goes through the timelock and cannot be rushed.
- A role holder is rotated through multisig + timelock, and the old holder loses access.
- After handover the old deployer key can neither pause nor rotate.
Also exercised live on 2026-09-29 against a local chain with the owner CLI: 1/3 signatures rejected, 3/3 pause executed, unpause scheduled through the timelock.

## Human rehearsals
| Date | Runbook | Participants | Step timings | Target | Result | Issues / follow-ups |
|---|---|---|---|---|---|---|
| | [pause & resume](../runbooks/pause-and-resume.md) | 3+ owners, IC | decision→pause on-chain: __ min | < 15 min | | |
| | [role rotation](../runbooks/role-rotation.md) | owners, admin | grant→execute: __ | 48 h+delay understood | | |
| | [upgrade](../runbooks/upgrade.md) | owners, tech lead | prepare→verify→schedule→execute | — | | |
| | [relayer key rotation](../runbooks/relayer-key-rotation.md) | ops | new key live: __ min | < 1 h | | |
| | [backup restore](../runbooks/backup-restore.md) | ops | restore-test: __ min | RTO ≤ 4 h | | |
| | [incident & CERT-In](../runbooks/incident-response.md) | IC, comms | notice→report drafted: __ min | < 6 h (aim 1 h) | | |
| | [alert drill](../runbooks/monitoring.md#testing-alerts) | ops | stop indexer→alert delivered: __ min | < 6 min | | |
