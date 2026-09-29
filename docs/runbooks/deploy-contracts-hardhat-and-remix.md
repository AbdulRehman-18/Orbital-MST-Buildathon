# Deploying the Namma Seva smart contracts: Hardhat and Remix

This guide explains how to deploy the Namma Seva contracts, and compares the ways to do it:

- **Hardhat** (the project's own scripts). This is the recommended way for anything real.
- **Remix** (the browser IDE). Useful for learning, demos, or when you cannot run Node locally.

For the short, checklist-style versions see [deploy-mst-testnet.md](deploy-mst-testnet.md) and
[deploy-mst-mainnet.md](deploy-mst-mainnet.md). This guide explains the *why* and covers Remix,
which those runbooks do not.

---

## 1. What gets deployed

Six contracts make up the system. Four of them are **upgradeable** (UUPS proxies).

| # | Contract | Upgradeable? | Constructor args | `initialize(...)` args | What it does |
|---|---|---|---|---|---|
| 1 | `NammaSevaAccess` | No | `admin` (your address) | none | Every role (official, auditor, contractor, relayer, pauser), plus which wards each person may act in, plus the emergency pause |
| 2 | `TrustedForwarder` | No | none | none | Relays gasless citizen transactions (ERC-2771) |
| 3 | `ProjectRegistry` | Yes | none | `access` | Projects, approvals, contractor assignment |
| 4 | `MilestoneEscrow` | Yes | none | `access, registry, mode, treasury` | Milestones, proof, approvals, payments |
| 5 | `GrievanceRegistry` | Yes | `trustedForwarder` | `access, registry, escalationThreshold, maxPerDay, responseSlaSeconds` | Citizen complaints, upvotes, escalation |
| 6 | `TenderRegistry` | Yes | none | `access, registry` | Sealed-bid tenders |

On mainnet there are two more: `NammaSevaMultisig` (3-of-5) and `NammaSevaTimelock` (48 h). These
end up holding ADMIN; see [deploy-mst-mainnet.md](deploy-mst-mainnet.md).

After deploying, **three wiring calls** connect the registry to the others. Each can only be set
once:

```
ProjectRegistry.setEscrow(MilestoneEscrow)
ProjectRegistry.setTenderRegistry(TenderRegistry)
ProjectRegistry.setGrievanceRegistry(GrievanceRegistry)
```

### What "upgradeable (UUPS proxy)" means

An upgradeable contract is deployed as **two** contracts:

1. **Implementation**: the actual code. Its constructor locks it (`_disableInitializers()`), so
   nobody can use it directly.
2. **Proxy** (`ERC1967Proxy`): a small contract that holds the data and forwards every call to
   the implementation. It is created with the implementation's address plus the encoded
   `initialize(...)` call, which runs once in the proxy's storage.

The apps and everyone else always talk to the **proxy address**. Upgrading means pointing the
proxy at a new implementation. The data stays where it is.

Hardhat does all of this for you (`upgrades.deployProxy`). In Remix you do it by hand; see §4.

### Settings that must never change

| Setting | Value | Why |
|---|---|---|
| Solidity | `0.8.24` | Fixed across all networks |
| Optimizer | enabled, `runs: 200` | Same bytecode everywhere |
| `viaIR` | `true` | Needed by the contracts; without it compilation fails ("stack too deep") |
| EVM version | **`shanghai`** | MST mainnet has no Cancun opcodes (`MCOPY`, `TSTORE`). Cancun bytecode fails there with *invalid opcode*. See ADR 0003. |
| OpenZeppelin | exactly `5.4.0` (contracts + contracts-upgradeable) | 5.5+ uses `mcopy`. See ADR 0003 / 0008. |

### Networks

| Network | Chain ID | RPC | Currency | Explorer |
|---|---|---|---|---|
| Local Hardhat | `31337` | `http://127.0.0.1:8545` | ETH (test) | none |
| MST Testnet | `91562037` | `https://testnetrpc.mstblockchain.com` | tMSTC | https://testnet.mstscan.com |
| MST Mainnet | `4646` | `https://mariorpc.mstblockchain.com` (backup: `https://craftrpc.mstblockchain.com`) | MSTC | https://mstscan.com |

Testnet coins: https://faucet.mstblockchain.com. A full deploy costs about 0.01 tMSTC at 1 gwei;
keep 0.2 tMSTC or more so the smoke test can fund its throwaway wallets.

---

## 2. Which method should I use?

| | Hardhat: `pnpm demo` | Hardhat: local node | Hardhat: MST testnet / mainnet | Remix |
|---|---|---|---|---|
| Good for | Trying the whole app in one command | Developing contracts | Real deployments | Learning, quick demos, no local setup |
| Deploys all 6 + wiring | ✅ automatically | ✅ automatically | ✅ automatically | ❌ by hand, about 13 transactions |
| Grants roles | ✅ demo cast | ✅ from `config/roles.localhost.json` | ✅ from `config/roles.<network>.json` | ❌ by hand |
| Checks upgrade safety | ✅ | ✅ | ✅ | ❌ |
| Writes the address file the apps read | ✅ | ✅ | ✅ | ❌ you write it |
| Verifies on mstscan | n/a | n/a | ✅ `pnpm verify:*` | ⚠️ manually, with the flattened source |
| Hardware wallet / multisig handover | n/a | n/a | ✅ | ❌ not supported by this guide |

**Rule of thumb:** use Hardhat for anything the app will actually run on. Use Remix only if you
understand you are doing by hand what `scripts/deploy.ts` does automatically.

---

## 3. Hardhat

All commands run from the repo root unless noted. Hardhat 3 needs **Node 22.13 or newer**
(`nvm use` picks it up from `.nvmrc`).

```bash
pnpm install
```

### Method 1: the whole demo stack in one command

Starts a local chain, deploys everything in LEDGER mode (amounts in ₹ paise), seeds demo data and
roles, then starts the indexer, API and web app.

```bash
pnpm demo
```

Open http://localhost:5173/login and pick a role. Each run starts from a fresh chain. Press
Ctrl+C to stop.

### Method 2: a local Hardhat node, step by step

Use this when you are working on the contracts themselves.

**Terminal 1**, the chain (keep it running):

```bash
pnpm chain:node
```

**Terminal 2**, from `packages/contracts`:

```bash
cd packages/contracts
```

1. Build and test. `build` also runs the Shanghai opcode guard.
   ```bash
   pnpm build && pnpm test
   ```
2. Deploy. This writes `deployments/localhost.json` and mirrors it into `packages/chain/deployments/`.
   ```bash
   pnpm deploy:local
   ```
   `NS_LOCAL_MODE=ESCROW pnpm deploy:local` deploys in ESCROW mode (payments in native coin)
   instead of LEDGER.
3. Grant roles. First copy `config/roles.example.json` to `config/roles.localhost.json` and fill
   in addresses and wards. Use `"ALL"` for every ward.
   ```bash
   pnpm roles:local
   ```
4. Optional: run the smoke test, which exercises the full lifecycle with throwaway wallets.
   ```bash
   pnpm smoke:local
   ```
5. Hand the ABIs and addresses to the apps.
   ```bash
   pnpm export-abis
   ```

### Method 3: MST testnet

The full checklist is [deploy-mst-testnet.md](deploy-mst-testnet.md). In short, from
`packages/contracts`:

1. Pre-flight: all of these must pass.
   ```bash
   pnpm build && pnpm test && pnpm slither
   ```
2. Secrets. Use a **fresh, testnet-only** key, never a Hardhat default key or a personal one.
   Never commit them.
   ```bash
   export DEPLOYER_PRIVATE_KEY=0x...
   export MST_TESTNET_RPC=https://testnetrpc.mstblockchain.com
   ```
3. Deploy. Testnet uses ESCROW mode and the deployer keeps ADMIN (`config/networks.ts`). Note the
   **start block** it prints: the indexer starts reading from there.
   ```bash
   pnpm deploy:mst-testnet
   ```
4. Verify every contract on testnet.mstscan.com (Blockscout).
   ```bash
   pnpm verify:mst-testnet
   ```
5. Smoke test. It prints an explorer link per step; keep the output as demo evidence.
   ```bash
   pnpm smoke:mst-testnet
   ```
6. Team roles: fill in `config/roles.mstTestnet.json` first. Safe to re-run.
   ```bash
   pnpm roles:mst-testnet
   ```
7. Publish the addresses to the apps.
   ```bash
   pnpm export-abis
   ```

Then point the apps at testnet in `.env`: `NS_CHAIN=mstTestnet`, `VITE_NS_CHAIN=mstTestnet`,
`MST_RPC_URLS`, `MST_EXPLORER_URL`. The relayer wallet in `RELAYER_PRIVATE_KEY` needs
`RELAYER_ROLE`.

### Method 4: MST mainnet (hardware wallet + multisig)

Mainnet is deliberately harder. Follow [deploy-mst-mainnet.md](deploy-mst-mainnet.md) exactly;
don't improvise. The differences:

- **No private key on disk.** `DEPLOYER_MODE=hardware` makes Hardhat ask **Frame**
  (https://frame.sh) to sign on a Ledger or Trezor. Point `MST_MAINNET_RPC` at Frame
  (`http://127.0.0.1:1248`).
- **LEDGER mode** and a real treasury (`NS_TREASURY`).
- **Governance** is deployed too: a 3-of-5 multisig (`NS_GOVERNANCE_OWNERS`, five distinct
  owners, none of them the deployer) and a 48-hour timelock. `deploy.ts` refuses anything weaker.
- **Order matters:** deploy, then verify, then grant roles, then hand over ADMIN
  (`CONFIRM_HANDOVER=mstMainnet pnpm handover:mst-mainnet`). After handover, every role change is
  a multisig proposal that waits 48 h, and **there is no undo**.
- Mainnet is **NO-GO** until the organisational gates close; see `docs/pilot/mainnet-go-no-go.md`.

### Upgrading later (Hardhat only)

Upgrades must go through Hardhat. The OpenZeppelin plugin checks the new version's storage layout
is compatible, and Remix does not. See [upgrade.md](upgrade.md) (`scripts/prepareUpgrade.ts`). On
mainnet an upgrade is a multisig proposal through the timelock.

---

## 4. Remix (https://remix.ethereum.org)

Remix deploys from the browser with MetaMask. You will do by hand exactly what
`scripts/lib/system.ts` does: 6 contracts plus 4 proxies, 3 wiring calls, then roles.

> ⚠️ Remix does not check upgrade safety and does not write the address file the apps read.
> Contracts deployed this way can only be verified with the **flattened** source (§4.8). Fine for
> testnet demos; use Hardhat for anything real.

### 4.1 Get the source into Remix: flatten it

The contracts import OpenZeppelin **5.4.0** exactly. The reliable way to get that exact code into
Remix is to flatten each contract locally, which inlines every import into one file. From
`packages/contracts`:

```bash
mkdir -p remix && for c in NammaSevaAccess ProjectRegistry MilestoneEscrow GrievanceRegistry TenderRegistry governance/Imports; do npx hardhat flatten contracts/$c.sol > remix/$(basename $c).sol; done
```

This creates `remix/NammaSevaAccess.sol`, `remix/ProjectRegistry.sol`, `remix/MilestoneEscrow.sol`,
`remix/GrievanceRegistry.sol`, `remix/TenderRegistry.sol` and `remix/Imports.sol`. The last one
contains `TrustedForwarder` (and the timelock). All six were checked to compile with the settings
below.

In Remix, create a new **blank workspace** and upload these six files (the upload icon in the File
Explorer), or paste each into a new file. Don't commit the `remix/` folder.

You also need OpenZeppelin's **proxy**. `hardhat flatten` does not flatten files inside
`node_modules`, so create one more file in Remix, `Proxy.sol`. Remix fetches the pinned version
from npm:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts@5.4.0/proxy/ERC1967/ERC1967Proxy.sol";
```

### 4.2 Compiler settings

In the **Solidity compiler** tab:

1. Compiler: **0.8.24+commit.e11b9ed9**
2. Open **Advanced configurations**, choose **Use configuration file**, and set
   `compiler_config.json` to:
   ```json
   {
     "language": "Solidity",
     "settings": {
       "optimizer": { "enabled": true, "runs": 200 },
       "viaIR": true,
       "evmVersion": "shanghai",
       "outputSelection": { "*": { "": ["ast"], "*": ["abi", "metadata", "devdoc", "userdoc", "storageLayout", "evm.legacyAssembly", "evm.bytecode", "evm.deployedBytecode", "evm.methodIdentifiers", "evm.gasEstimates", "evm.assembly"] } }
     }
   }
   ```
3. Compile each of the seven files. With `viaIR` the big ones take a while; that's normal.

Double-check the EVM version is **shanghai**. The Remix default is newer, and that bytecode will
fail on MST mainnet.

### 4.3 Connect MetaMask to MST

Add the network in MetaMask (Settings → Networks → Add a network manually):

| Field | MST Testnet | MST Mainnet |
|---|---|---|
| Network name | MST Testnet | MST Mainnet |
| RPC URL | `https://testnetrpc.mstblockchain.com` | `https://mariorpc.mstblockchain.com` |
| Chain ID | `91562037` | `4646` |
| Currency symbol | `tMSTC` | `MSTC` |
| Block explorer | `https://testnet.mstscan.com` | `https://mstscan.com` |

Fund the account from the faucet (testnet). In Remix's **Deploy & run transactions** tab, set
**Environment** to *Injected Provider - MetaMask* and confirm the chain ID it shows.

To rehearse without real coins, use *Remix VM (Shanghai)*. Everything below works there too.

### 4.4 Deploy, in this order

Keep a notepad open: you need each address for the next steps. **Note the block number of your
first transaction.** The indexer needs it as its start block.

**Step 1: `NammaSevaAccess`** (file `NammaSevaAccess.sol`)
- Constructor `admin`: your MetaMask address. This account gets ADMIN.
- Deploy, then save the address as **ACCESS**.

**Step 2: `TrustedForwarder`** (file `Imports.sol`)
- No arguments. Deploy, then save as **FORWARDER**.

**Steps 3 to 6: each upgradeable contract is two deployments.** First the implementation, then a
proxy that points at it and runs `initialize`:

```
a) Deploy the implementation (constructor args as below)           → IMPL address
b) Build the initialize(...) calldata (see "Getting the calldata")
c) Deploy ERC1967Proxy (file Proxy.sol) with:
     implementation = IMPL
     _data          = the calldata from (b)
   → PROXY address. This is the contract's real address; save it.
```

| Step | Contract | Implementation constructor | `initialize(...)` values | Save proxy as |
|---|---|---|---|---|
| 3 | `ProjectRegistry` | none | `access_ = ACCESS` | **REGISTRY** |
| 4 | `MilestoneEscrow` | none | `access_ = ACCESS`, `registry_ = REGISTRY`, `mode_ = 1` (ESCROW: native coin, testnet) or `0` (LEDGER: ₹ paise, mainnet/pilot), `treasury_ = ` refund address (your address on testnet) | **ESCROW** |
| 5 | `GrievanceRegistry` | `trustedForwarder_ = FORWARDER` | `access_ = ACCESS`, `registry_ = REGISTRY`, `escalationThreshold_ = 5`, `maxGrievancesPerDay_ = 3`, `responseSla_ = 604800` (7 days) | **GRIEVANCE** |
| 6 | `TenderRegistry` | none | `access_ = ACCESS`, `registry_ = REGISTRY` | **TENDER** |

The grievance values above are the testnet ones from `config/networks.ts`. Mainnet uses an
escalation threshold of `25`; local uses `3`.

**Getting the calldata for `_data`.** Pick either option:

- **In Remix:** after deploying the implementation, expand it under *Deployed Contracts*, expand
  `initialize`, fill in the fields, and click the **copy calldata** icon. ⚠️ **Do not click
  `transact`** on the implementation. It is locked and would revert. You only want the calldata.
- **From a terminal** (in `packages/contracts`, where ethers is installed). Example for
  `ProjectRegistry`:
  ```bash
  node --input-type=module -e 'import { Interface } from "ethers"; console.log(new Interface(["function initialize(address access_)"]).encodeFunctionData("initialize", ["0xACCESS..."]))'
  ```
  For the others, change the signature. For example, `MilestoneEscrow` is
  `function initialize(address access_, address registry_, uint8 mode_, address treasury_)`.

**Use the proxy in Remix:** select the contract (for example `ProjectRegistry`) in the *Contract*
dropdown, paste the **proxy** address into **At Address**, and click it. Remix now shows the
contract's functions running on the proxy.

### 4.5 Wire the registry

On **REGISTRY** (the `ProjectRegistry` proxy, loaded via *At Address*), as the ADMIN account:

1. `setEscrow(ESCROW)`
2. `setTenderRegistry(TENDER)`
3. `setGrievanceRegistry(GRIEVANCE)`

Each can be set only **once**. A mistake here means redeploying the registry, so paste carefully.

### 4.6 Grant roles and wards

On **ACCESS** (`NammaSevaAccess`):

- `grantRole(role, account)`. The `role` value is a hash. Read it from the contract's own buttons
  (`GOVT_OFFICIAL_ROLE`, `AUDITOR_ROLE`, and so on), or copy from here:

  | Role | Hash |
  |---|---|
  | GOVT_OFFICIAL | `0x030064750be3b235088dfbd90d5064d086e890c106bb762f8d5dbf0dc53b8542` |
  | AUDITOR | `0xd8994f6d76f930dc5ea8c60e38e6334a87bb8539cc3082ac6828681c33316e3d` |
  | CONTRACTOR | `0xaa472d43dfaaa71d0648ba208dac52d55b4e7dd82b5aff87647d287135881a27` |
  | RELAYER | `0xab4f864e5201b0fde9b5ee3e4cf96384802b0ffdfcf7f9de4699ce21a30afc4f` |
  | PAUSER | `0x539440820030c4994db4e31b6b800deafd503688728f932addfe7a410515c14c` |

- `setWardAccess(account, wardId, true)` for officials and auditors: the wards they may act in.
  `wardId = 4294967295` (`ALL_WARDS`) means every ward. `setWardAccessBatch(account, [ids], true)`
  does several at once.
- The API's relayer wallet (`RELAYER_PRIVATE_KEY`) needs `RELAYER_ROLE`, or gasless citizen
  complaints will fail.
- Approving a project needs as many **different** auditors as its approval threshold, so grant at
  least that many.

### 4.7 Tell the apps where the contracts are

Hardhat writes this file for you; with Remix you write it yourself. Create
`packages/contracts/deployments/<network>.json` (for example `mstTestnet.json`) in this shape,
copy it to `packages/chain/deployments/<network>.json`, then run `pnpm export-abis` from
`packages/contracts`:

```json
{
  "network": "mstTestnet",
  "chainId": 91562037,
  "blockNumber": 1234567,
  "commit": "remix",
  "deployedAt": "2026-09-29T00:00:00.000Z",
  "deployer": "0xYOUR_ADDRESS",
  "mode": "ESCROW",
  "contracts": {
    "NammaSevaAccess":   { "address": "ACCESS",    "constructorArgs": ["0xYOUR_ADDRESS"], "fqn": "contracts/NammaSevaAccess.sol:NammaSevaAccess" },
    "TrustedForwarder":  { "address": "FORWARDER", "constructorArgs": [], "fqn": "contracts/governance/Imports.sol:TrustedForwarder" },
    "ProjectRegistry":   { "address": "REGISTRY",  "implementation": "REGISTRY_IMPL",  "constructorArgs": [], "fqn": "contracts/ProjectRegistry.sol:ProjectRegistry" },
    "MilestoneEscrow":   { "address": "ESCROW",    "implementation": "ESCROW_IMPL",    "constructorArgs": [], "fqn": "contracts/MilestoneEscrow.sol:MilestoneEscrow" },
    "GrievanceRegistry": { "address": "GRIEVANCE", "implementation": "GRIEVANCE_IMPL", "constructorArgs": ["FORWARDER"], "fqn": "contracts/GrievanceRegistry.sol:GrievanceRegistry" },
    "TenderRegistry":    { "address": "TENDER",    "implementation": "TENDER_IMPL",    "constructorArgs": [], "fqn": "contracts/TenderRegistry.sol:TenderRegistry" }
  }
}
```

- `blockNumber` is the block of your **first** deployment transaction. The indexer starts
  there; too high and it misses events.
- `mode` must match the `mode_` you passed to `MilestoneEscrow` (`1` is `"ESCROW"`, `0` is
  `"LEDGER"`).

Then point `.env` at the network (`NS_CHAIN`, `VITE_NS_CHAIN`, RPC, explorer) as in §3 Method 3.

### 4.8 Verify on mstscan

`pnpm verify:*` submits the original multi-file sources. Their metadata differs from the flattened
files you deployed, so it **will not match** Remix deployments. Verify each contract on
mstscan instead:

1. Open the contract's address on testnet.mstscan.com, then **Code**, then **Verify & Publish**.
2. Choose **Solidity (Single file)** and paste the same flattened file you compiled in Remix.
3. Compiler `v0.8.24+commit.e11b9ed9`, EVM **shanghai**, optimization **on** with **200** runs,
   and **via IR** turned on.
4. Constructor arguments: ABI-encoded, only where the table in §4.4 lists any (`NammaSevaAccess`
   and the `GrievanceRegistry` implementation).
5. Verify the **implementations**. Blockscout detects the ERC-1967 proxies and links them to their
   implementation.

Remix's *Contract Verification* plugin can also submit to a Blockscout instance, if you prefer to
stay in Remix.

### 4.9 Upgrading a Remix deployment

Don't upgrade from Remix. Remix will happily call `upgradeToAndCall` with an incompatible
implementation and corrupt the contract's stored data. Upgrade with Hardhat; first register the
existing proxies with the plugin (`upgrades.forceImport`) so it can check storage layouts, then
follow [upgrade.md](upgrade.md).

---

## 5. After any deployment: quick checks

- `NammaSevaAccess.hasRole(<role hash>, <address>)` returns `true` for each person you set up.
- `ProjectRegistry.escrow()`, `tenderRegistry()` and `grievanceRegistry()` return the right
  proxies.
- `MilestoneEscrow.mode()` is what you intended (0 = LEDGER, 1 = ESCROW).
- Run the smoke test (Hardhat): `pnpm smoke:mst-testnet`. Or click through once in the web app:
  create a project as an official, approve it as an auditor, and file a complaint as a citizen.

## 6. Common errors

| Error | Cause | Fix |
|---|---|---|
| `invalid opcode` / `MCOPY` on MST mainnet | Compiled for Cancun or later | EVM version **shanghai**; OpenZeppelin exactly 5.4.0 |
| `Stack too deep` | `viaIR` off | Turn on `viaIR` (Remix: config file in §4.2) |
| `InvalidInitialization` | Called `initialize` on the implementation, or twice on a proxy | Only initialize through the proxy's `_data`, once |
| `AccessControlUnauthorizedAccount` | The account lacks the role, e.g. wiring from a non-ADMIN account | Use the ADMIN account, or grant the role first |
| Wiring call reverts with "already set" | `setEscrow` / `setTenderRegistry` / `setGrievanceRegistry` can only be set once | Redeploy `ProjectRegistry` if it was set wrong |
| Official can't create a project in a ward | Has the role but no ward access | `setWardAccess(official, wardId, true)` |
| Citizen complaints fail with a 503 or revert | Relayer not configured, or missing `RELAYER_ROLE` | Set `RELAYER_PRIVATE_KEY`, then `grantRole(RELAYER_ROLE, relayer)` |
| Apps show nothing | Address file missing or wrong `blockNumber` | Write or fix `deployments/<network>.json`, run `pnpm export-abis`, restart the API |
| Hardhat: `HHE…` config variable not set | Missing env var | `export DEPLOYER_PRIVATE_KEY=…` and `MST_TESTNET_RPC=…` |
| Hardhat: engine error | Node too old | Node 22.13 or newer (`nvm use`) |

## 7. Security reminders

- Never commit private keys, never reuse a personal wallet, and never use Hardhat's default keys
  outside a local chain. They are public.
- Mainnet: hardware wallet only, then multisig and timelock handover. The deployer renounces ADMIN
  afterwards.
- Flattened files and `deployments/*.json` hold no secrets, but double-check any file before
  pasting it into a website.
