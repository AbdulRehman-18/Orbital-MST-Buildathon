# Runbook — role rotation

Roles (`GOVT_OFFICIAL`, `AUDITOR`, `CONTRACTOR`, `RELAYER`, `PAUSER`) and ward scopes live in `NammaSevaAccess`. After the mainnet handover, ADMIN is the timelock, so **every grant or revoke is a multisig proposal with a 48 h delay**. Plan rotations accordingly; an *emergency removal* of a compromised holder can be done immediately only by pausing the system first ([pause-and-resume.md](pause-and-resume.md)).

## Routine rotation (person leaves, replacement arrives)
Grant first, revoke second, so the ward is never without a holder. Both are timelock operations; you can schedule them together.

1. Role id: `cast keccak "AUDITOR"` (or read `AUDITOR_ROLE()`); ward access uses `setWardAccess(address,uint32,bool)`.
2. Grant to the replacement:
   ```bash
   pnpm --filter @namma-seva/contracts multisig mstMainnet call access "grantRole(bytes32,address)" '["<role id>","0xNEW"]' --timelock
   pnpm --filter @namma-seva/contracts multisig mstMainnet call access "setWardAccess(address,uint32,bool)" '["0xNEW",150,true]' --timelock
   ```
   Owners confirm + execute each multisig tx; note every **salt**.
3. After 48 h execute the same calls with `--timelock --execute-scheduled --salt <salt>`.
4. Revoke the leaver the same way with `revokeRole(bytes32,address)` and `setWardAccess(...,false)`.
5. Verify in the app: `/api/roles` (or the Admin console) lists the new holder; sign in with the new wallet.

## Compromised key (suspected misuse)
1. If funds may move: **pause** first.
2. Schedule the `revokeRole` immediately (48 h). Until it executes the key still works, so pause is the only immediate control. Note this residual window in the incident log.
3. Officials and auditors act only inside their ward; the on-chain approval threshold (2 auditor approvals + official) limits what one key can do.

## Multisig owner rotation
Owner set and threshold change only through the multisig itself (`addOwner`, `removeOwner`, `changeThreshold` — `onlySelf`). Never drop below 5 owners or a 3 threshold on mainnet. Sequence: add the new owner → confirm they can sign (`multisig … list`) → remove the old owner. Update the owner table in `docs/pilot/pilot-plan.md` and publish the change (the Transparency page reflects it automatically).

## Testnet / pilot with a single admin wallet
`pnpm --filter @namma-seva/contracts roles:mst-testnet` re-applies `config/roles.mstTestnet.json` (idempotent, additive). Revocations are direct `revokeRole` calls from the admin.
