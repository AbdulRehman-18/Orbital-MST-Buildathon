#!/usr/bin/env node
// `pnpm demo` — the whole Namma Seva stack locally, no Docker needed:
//   Hardhat chain → deploy contracts (LEDGER mode, ₹) → in-memory Postgres (PGlite) → migrations
//   → reference + demo data (real transactions from the demo cast) → indexer → API → web.
// Open http://localhost:5173/login and pick a role. Ctrl+C stops everything; each run starts
// from a fresh chain and database.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGS = path.join(ROOT, ".data", "logs");
mkdirSync(LOGS, { recursive: true });

const RPC_PORT = 8545;
const PG_PORT = Number(process.env.DEMO_PG_PORT ?? 54329);
const DATABASE_URL = process.env.DEMO_DATABASE_URL ?? `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`;

// Explicit env for every child; wins over the repo .env (Node's loadEnvFile and Vite's loadEnv
// never override variables that are already set).
const env = {
  ...process.env,
  NODE_ENV: "development",
  NS_DEMO_MODE: "true",
  NS_CHAIN: "local",
  VITE_NS_CHAIN: "local",
  VITE_NS_EXPLORER_URL: "",
  MST_RPC_URLS: `http://127.0.0.1:${RPC_PORT}`,
  CONFIRMATIONS: "2",
  INDEXER_POLL_MS: "1500",
  DATABASE_URL,
  REDIS_URL: "",
  PINATA_JWT: "",
  OTP_PROVIDER: "console",
  SIWE_DOMAIN: "localhost:5173",
  PUBLIC_BASE_URL: "http://localhost:5173",
  CORS_ORIGINS: "http://localhost:5173",
  RELAYER_PRIVATE_KEY: "",
  NS_LOCAL_MODE: process.env.NS_LOCAL_MODE ?? "LEDGER",
  FORCE_COLOR: "1",
};

const COLORS = { chain: 90, db: 90, indexer: 36, api: 35, web: 32, demo: 33 };
const children = [];
const isWin = process.platform === "win32";

function log(name, line) {
  process.stdout.write(`\x1b[${COLORS[name] ?? 37}m${name.padEnd(7)}\x1b[0m ${line}\n`);
}

function start(name, cmd, args, { toFile = false } = {}) {
  const child = spawn(cmd, args, { cwd: ROOT, env, shell: isWin, detached: !isWin });
  children.push(child);
  const sink = toFile ? createWriteStream(path.join(LOGS, `${name}.log`)) : null;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream.on("data", (d) => {
      if (sink) return sink.write(d);
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) if (l.trim()) log(name, l);
    });
  }
  child.on("exit", (code) => {
    if (!shuttingDown) {
      log("demo", `${name} exited (${code}) — see ${sink ? path.join(LOGS, `${name}.log`) : "output above"}`);
      shutdown(1);
    }
  });
  return child;
}

function step(name, cmd, args) {
  log("demo", `▸ ${name}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, env, shell: isWin, encoding: "utf8" });
  if (r.status !== 0) {
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    log("demo", `✗ ${name} failed`);
    shutdown(1);
  }
  return r.stdout;
}

// Vite binds ::1 on Windows, Hardhat 127.0.0.1 — probe both.
const probe = (port, host) =>
  new Promise((resolve) => {
    const s = net.connect(port, host);
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
  });
const portOpen = async (port) => (await probe(port, "127.0.0.1")) || (await probe(port, "::1"));

async function waitFor(port, what, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (!(await portOpen(port))) {
    if (Date.now() > until) {
      log("demo", `✗ ${what} did not start on :${port}`);
      shutdown(1);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    try {
      if (isWin) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-c.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ─── Go ───────────────────────────────────────────────────────────────────
for (const [port, what] of [[RPC_PORT, "a local chain"], [PG_PORT, "a database"], [3001, "the API"], [5173, "the web app"]]) {
  if (!process.env.DEMO_DATABASE_URL || port !== PG_PORT) {
    if (await portOpen(port)) {
      log("demo", `✗ Port ${port} is busy (${what} already running?). Stop it first — the demo needs a fresh stack.`);
      process.exit(1);
    }
  }
}

log("demo", "▸ starting local chain (logs: .data/logs/chain.log)");
start("chain", "pnpm", ["--filter", "@namma-seva/contracts", "node"], { toFile: true });
if (!process.env.DEMO_DATABASE_URL) {
  log("demo", "▸ starting in-memory Postgres (PGlite)");
  start("db", "pnpm", ["exec", "pglite-server", `--port=${PG_PORT}`, "--max-connections=40"], { toFile: true });
  await waitFor(PG_PORT, "PGlite");
}
await waitFor(RPC_PORT, "Hardhat node");

step("deploy contracts", "pnpm", ["--filter", "@namma-seva/contracts", "deploy:local"]);
step("migrate database", "pnpm", ["--filter", "@namma-seva/db", "migrate"]);
step("seed wards & departments", "pnpm", ["--filter", "@namma-seva/db", "seed"]);
step("seed demo projects on-chain (≈10 s)", "pnpm", ["--filter", "@namma-seva/api", "demo:seed"]);

// Hardhat only mines when a tx arrives; MST produces a block every ~3 s. Without steady blocks
// the confirmation window never advances and new actions would never be indexed.
await fetch(`http://127.0.0.1:${RPC_PORT}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_setIntervalMining", params: [2000] }),
});
log("demo", "▸ chain mining a block every 2 s");

start("indexer", "pnpm", ["--filter", "@namma-seva/api", "indexer"]);
start("api", "pnpm", ["--filter", "@namma-seva/api", "dev"]);
await waitFor(3001, "API");
start("web", "pnpm", ["--filter", "@namma-seva/web", "dev"]);
await waitFor(5173, "web");

log("demo", "");
log("demo", "\x1b[1mNamma Seva demo is up →  http://localhost:5173/login\x1b[0m");
log("demo", "Pick a role card (citizen, official, auditor, contractor, admin). Ctrl+C to stop.");
