Deployment manifests written by `packages/contracts/scripts/deploy.ts` (one per network).
`blockNumber` is the indexer start block. Public-network manifests (`mstTestnet.json`,
`mstMainnet.json`) are committed and embedded into `src/deployments.ts` by `export-abis`;
`localhost.json` is git-ignored and read at runtime.
