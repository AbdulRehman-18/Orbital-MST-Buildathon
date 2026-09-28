import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getNetwork, type Network, type NetworkName } from "@namma-seva/chain";

// Load the repo-root .env in development. Production injects env vars directly.
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function readPort(): number {
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: "${process.env.PORT}"`);
  return port;
}

const chainName = (process.env.NS_CHAIN ?? "mstTestnet") as NetworkName;

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: readPort(),
  demoMode: process.env.NS_DEMO_MODE === "true",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  chainName,
  network: getNetwork(chainName) as Network,
} as const;
