# Runbook — deploy to MST mainnet

**Do not start until every "Required before mainnet" gate in [`docs/pilot/mainnet-go-no-go.md`](../pilot/mainnet-go-no-go.md) is signed off.** Mainnet deployment is irreversible: there is no redeploy-and-forget like testnet.

Roles for this runbook: **Deployer** (one person, hardware wallet), **Witness** (a second person watching the screen and the explorer), **Owners** (the five multisig signers, each with their own wallet).

## 0. Prerequisites
- Node 22, `pnpm install`, Frame (https://frame.sh) installed on the deployer's machine with the hardware wallet connected. Add MST mainnet to Frame as a custom chain (chain id 4646, RPC `https://mariorpc.mstblockchain.com`).
- The **deployer address is new**, hardware-backed and funded with ≈ 0.5 MSTC. It is used once and never again (it renounces ADMIN in step 6).
- Five multisig owner addresses collected in person or by verified video call, each from a different organisation: department head, IT officer, independent auditor, civic-society representative, platform operator. No owner is the deployer.
- The department treasury address (LEDGER mode refund/treasury recipient).
- The relayer KMS keys exist ([relayer-key-rotation.md](relayer-key-rotation.md)) and `pnpm --filter @namma-seva/api kms:address <key-id> <hmac-key-id>` prints the relayer address.

## 1. Pre-flight (Witness runs, Deployer watches)
```bash
git checkout <release-tag> && git status   # clean, on the tagged release the audit covered
pnpm install --frozen-lockfile
pnpm --filter @namma-seva/contracts build && pnpm --filter @namma-seva/contracts test
pnpm --filter @namma-seva/contracts slither
```
Compare `git rev-parse HEAD` with the commit named in the audit report. They must match.

## 2. Environment (Deployer's machine only)
```bash
export DEPLOYER_MODE=hardware                      # Hardhat asks Frame to sign; no key ever touches disk
export MST_MAINNET_RPC=http://127.0.0.1:1248       # Frame's local RPC, chain set to MST mainnet
export NS_TREASURY=0x…                             # department treasury
export NS_GOVERNANCE_OWNERS=0x…,0x…,0x…,0x…,0x…   # the five owners, comma separated
```
`scripts/deploy.ts` refuses mainnet unless there are ≥ 5 distinct owners, threshold ≥ 3, timelock ≥ 48 h, a non-zero treasury, and the deployer is not an owner.

## 3. Deploy
```bash
pnpm --filter @namma-seva/contracts deploy:mst-mainnet
```
Confirm each transaction on the hardware device. Record the **start block** it prints. This writes `deployments/mstMainnet.json` (+ mirror in `packages/chain/deployments`). The Witness checks every address on https://mstscan.com as it appears.

## 4. Verify on mstscan
```bash
pnpm --filter @namma-seva/contracts verify:mst-mainnet
```
Every contract must show **Verified**. If Blockscout verification fails see ADR 0007 (fallback: Blockscout `/api/v2` verification).

## 5. Grant roles, **before** handover
Copy `config/roles.example.json` to `config/roles.mstMainnet.json` and fill in the approved officials, auditors, contractors, PAUSER holders and the **relayer address from KMS**. Two reviewers sign off the file in a PR, then:
```bash
pnpm --filter @namma-seva/contracts roles:mst-mainnet
```
After step 6 every role change is a multisig + 48 h timelock proposal.

## 6. Hand over ADMIN (point of no return)
```bash
CONFIRM_HANDOVER=mstMainnet pnpm --filter @namma-seva/contracts handover:mst-mainnet
```
Result: the **timelock** holds ADMIN and PAUSER; the **multisig** also holds PAUSER (instant 3-of-5 emergency stop); the deployer renounced both. The script prints all three.

Verify independently:
```bash
pnpm --filter @namma-seva/contracts multisig mstMainnet list      # 3-of-5, your address is an owner
curl -s https://<host>/api/transparency | jq .governance          # adminKind MULTISIG_TIMELOCK, delay 172800, 5 owners
```
Then **retire the deployer wallet**: do not fund it, do not reuse it.

## 7. Publish
```bash
pnpm --filter @namma-seva/contracts publish-addresses:mst-mainnet   # docs/deployments/mstMainnet.md
pnpm --filter @namma-seva/contracts export-abis                     # embeds addresses in @namma-seva/chain
```
Commit and merge via PR (or run the *Deploy contracts → publish* workflow). Announce the addresses on the site (the Transparency page reads them from the API) and in the repository README.

## 8. Cut over the apps
Set `NS_CHAIN=mstMainnet`, KMS variables, `MST_RPC_URLS`, `CSP_CONNECT_EXTRA` (mainnet RPC hosts), `PILOT_NAME`, grievance-officer details; **`NS_DEMO_MODE` must be unset** (the API refuses to boot with it on mainnet). Deploy, then:
```bash
curl -s https://<host>/api/ready        # database, rpc, indexer all ok
```
Fund the relayer (≈ the daily cap × 7) and watch the `RelayerLowBalance` alert stay quiet.

## 9. Post-launch rehearsal
Within 24 h, with all five owners online, perform a **live pause drill on mainnet-equivalent staging** — never on mainnet with real citizens — see [pause-and-resume.md](pause-and-resume.md). Log it in `docs/pilot/rehearsal-log.md`.

## Abort criteria
Stop and do **not** hand over ADMIN if: any contract fails verification; the deployed commit differs from the audited one; an owner cannot demonstrate control of their key; the manifest lists an address you did not expect. Until handover the deployer can still fix things; after it, nobody can without the timelock.
