# Runbook — emergency pause and resume

The `NammaSevaAccess` contract has a system-wide kill switch that every registry and the escrow honour (`whenNotPaused`). While paused, no project, milestone, payment, grievance or tender **state change** can happen; reads and public verification keep working.

| | Who | Delay | How |
|---|---|---|---|
| **Pause** | PAUSER: the **multisig** (3 of 5) — and the timelock | **none** | 3 owners sign a `pause()` transaction |
| **Resume** | ADMIN: the **timelock** | **48 h** | multisig proposes `schedule(unpause)`, waits, then `execute` |

Pause is fast on purpose; resume is slow on purpose (nobody can quietly turn the system back on after an incident). On testnet/pilot with a single admin wallet, `pause()` and `unpause()` are direct calls.

## When to pause
Confirmed or strongly suspected: a contract exploit; a compromised owner/official/auditor key **being used** to move money; funds leaving the escrow unexpectedly; a validator-set incident on MST that makes recent history unreliable. Not for: indexer lag, an outage of the web tier, a stuck relayer (those don't threaten funds).

## Pause (target: < 15 minutes from decision)
1. Incident commander announces in the owners' channel: *"Pause requested — reason — tx to be submitted by <owner>"*. Three owners must be reachable; find them **before** an incident (see the on-call sheet in the pilot plan).
2. Owner A proposes (auto-confirms their own signature):
   ```bash
   pnpm --filter @namma-seva/contracts multisig mstMainnet call access pause
   ```
3. Owners B and C review the transaction id and calldata `0x8456cb59` (= `pause()`), then:
   ```bash
   pnpm --filter @namma-seva/contracts multisig mstMainnet confirm <id>
   ```
4. Any owner executes:
   ```bash
   pnpm --filter @namma-seva/contracts multisig mstMainnet execute <id>
   ```
5. Verify: `curl -s https://<host>/api/transparency | jq .governance.paused` → `true`; the site's Transparency page shows **Paused**.
6. The API/web keep serving reads. Relayer jobs will fail with `SystemPaused` and are marked failed (citizens see the error); they can be re-filed after resume.
7. Start the [incident response](incident-response.md) clock (CERT-In 6 h).

## Resume
Only after the root cause is fixed and reviewed (contract fix = [upgrade](upgrade.md)).
1. Owner A schedules the unpause through the timelock (keep the printed **salt**):
   ```bash
   pnpm --filter @namma-seva/contracts multisig mstMainnet call access unpause --timelock
   ```
2. Owners B, C `confirm`; anyone `execute`s the multisig transaction → the operation is scheduled on the timelock.
3. After the delay (48 h on mainnet), Owner A submits the execution with the same salt:
   ```bash
   pnpm --filter @namma-seva/contracts multisig mstMainnet call access unpause --timelock --execute-scheduled --salt <salt>
   ```
   then B, C `confirm`, anyone `execute`.
4. Verify `paused` is `false`; post an incident summary.

## Rehearsal (required before pilot and after any owner change)
The full sequence (3-of-5 pause with no delay, unpause only through the timelock, old deployer key powerless, role rotation) runs in CI as `packages/contracts/test/Governance.test.ts` ("emergency pause and role rotation"). Rehearse the **human** process on the testnet staging deployment with the real owners and their real signing setup, timing each step, and record it in `docs/pilot/rehearsal-log.md` (template in that file). Target: pause confirmed on-chain < 15 min after the go decision.

## Testnet / pilot with a single admin wallet
```bash
pnpm --filter @namma-seva/contracts exec hardhat console --network mstTestnet
# > const a = await ethers.getContractAt("NammaSevaAccess", "<address>"); await (await a.pause()).wait()
```
