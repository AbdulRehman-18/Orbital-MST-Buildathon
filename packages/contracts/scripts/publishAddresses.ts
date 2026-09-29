// Writes docs/deployments/<network>.md from the deployment manifest — the human-readable list of
// verified contract addresses that the repo and the Transparency page point to (plan §8.4:
// "publish addresses in repo and on the site"). Idempotent; commit the result.
//   pnpm --filter @namma-seva/contracts publish-addresses:mst-mainnet
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { network } from "hardhat";
import { CONTRACTS_ROOT, readDeployment } from "./lib/deployments.js";

const { networkName } = await network.create();
const d = readDeployment(networkName);
const explorer: Record<number, string> = { 91562037: "https://testnet.mstscan.com", 4646: "https://mstscan.com" };
const base = explorer[d.chainId];
const link = (a: string) => (base ? `[\`${a}\`](${base}/address/${a}#code)` : `\`${a}\``);

const rows = Object.entries(d.contracts).map(
  ([name, c]) => `| ${name} | ${link(c.address)} | ${c.implementation ? link(c.implementation) : "—"} |`,
);
const md = `# Namma Seva contracts — ${networkName}

Generated from \`packages/contracts/deployments/${networkName}.json\` by \`publish-addresses\`. Do not edit by hand.

| | |
|---|---|
| Chain ID | ${d.chainId} |
| Mode | ${d.mode} |
| Deployed | ${d.deployedAt} |
| Source commit | \`${d.commit}\` |
| Indexer start block | ${d.blockNumber} |
| Deployer (renounced after handover) | \`${d.deployer}\` |

| Contract | Address | Implementation |
|---|---|---|
${rows.join("\n")}

To check a contract: open the address on the explorer, confirm the source is **verified**, and compare
it with the same commit in this repository. Who can change these contracts, and the network's trust
assumptions, are on the public Transparency page of the app.
`;
const out = path.join(CONTRACTS_ROOT, "../../docs/deployments");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, `${networkName}.md`), md);
console.log(`✓ docs/deployments/${networkName}.md`);
