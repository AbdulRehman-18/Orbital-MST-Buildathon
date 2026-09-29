# Architecture Decision Records

One decision per file, numbered, never rewritten — supersede with a new ADR instead.
Format: Context → Decision → Consequences, plus the evidence behind it.

| # | Title | Status |
|---|---|---|
| [0001](0001-web-only-shadcn-monorepo.md) | Web-only shadcn monorepo | Accepted |
| [0002](0002-mst-network-parameters.md) | MST network parameters | Accepted (verified against live RPC) |
| [0003](0003-evm-version-shanghai.md) | Compile for `evmVersion: shanghai` | Accepted |
| [0004](0004-confirmations-and-indexing.md) | Confirmations & log indexing limits | Accepted |
| [0005](0005-gas-pricing.md) | Gas pricing | Accepted |
| [0006](0006-no-standard-infra-contracts.md) | No Safe / Multicall3 / EntryPoint on MST | Accepted |
| [0007](0007-contract-verification-blockscout.md) | Contract verification via Blockscout | Accepted |
| [0008](0008-openzeppelin-5-4-and-toolchain.md) | OpenZeppelin 5.4.0 pinned; Hardhat 3 on Node 22 | Accepted |
| [0009](0009-cids-in-events.md) | IPFS CIDs in events, content hashes in storage | Accepted |
| [0010](0010-backend-indexer-relayer.md) | Indexer, live updates and citizen signing keys | Accepted |
| [0011](0011-demo-mode.md) | Demo mode: real flows with burner wallets | Accepted |
| [0012](0012-hardening-and-compliance.md) | Phase 6: instant emergency stop, KMS custody, consent & erasure, retention, observability | Accepted |

## Plan §21 open questions — status

| # | Question | Status | Where |
|---|---|---|---|
| 1 | EVM version (PUSH0, MCOPY) | ✅ Resolved | 0003 |
| 2 | RPC endpoints, rate limits, `getLogs` range, archive | ✅ Resolved (rate limits not published) | 0002, 0004 |
| 3 | Finality / confirmation count | ✅ Resolved | 0004 |
| 4 | Contract verification API | ✅ Resolved | 0007 |
| 5 | MST-20 / MST-721 naming or registry | ✅ Plain ERC-20/721 (docs + Vibe Kit use standard OZ contracts) | — |
| 6 | Deployer whitelisting on mainnet | ⏳ Not documented; docs describe permissionless deploys. Confirm with MST support before mainnet. | — |
| 7 | Safe, Multicall3, ERC-4337 EntryPoint | ✅ Resolved — none deployed | 0006 |
| 8 | BridgeKey injected provider / WalletConnect | ⏳ Not in developer docs. Test with the extension in Phase 4; MetaMask stays primary. | — |
| 9 | Faucet limits / project allocation | ⏳ Docs say "a fixed amount per request". Ask MST for a pilot allocation. | — |
| 10 | Subgraph / indexing service | ✅ None documented → own indexer (Phase 3) | 0004 |
| 11 | Gas model | ✅ Resolved | 0005 |
| 12 | Grants / ecosystem program | ⏳ Not in developer docs. Ask MST (buildathon organisers). | — |
