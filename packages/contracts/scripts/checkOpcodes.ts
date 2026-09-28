// Guards the Shanghai-only compilation target required by MST mainnet (docs/adr/0003):
// MCOPY, TLOAD, TSTORE, BLOBHASH and BLOBBASEFEE revert with "invalid opcode" there.
//
// Scanning bytecode linearly is unreliable — via-IR appends data sections after INVALID (0xfe)
// that can contain any byte — so instead this verifies the two things that actually guarantee it:
//   1. every compilation in artifacts/build-info used `evmVersion: "shanghai"` (solc then refuses
//      to emit or accept Cancun instructions), and
//   2. no compiled source (ours or a dependency) uses a Cancun Yul builtin, which would mean a
//      dependency upgrade slipped in code that only compiles under Cancun settings.
//
//   pnpm --filter @namma-seva/contracts check:opcodes   (run after `hardhat build`)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_EVM = "shanghai";
const CANCUN_BUILTINS = /\b(mcopy|tload|tstore|blobhash|blobbasefee)\s*\(/;

type BuildInfo = {
  solcVersion: string;
  input: {
    settings: { evmVersion?: string };
    sources: Record<string, { content?: string }>;
  };
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildInfoDir = path.join(root, "artifacts", "build-info");

const files = readdirSync(buildInfoDir).filter((f) => f.endsWith(".json") && !f.endsWith(".output.json"));
if (files.length === 0) {
  console.error("✗ No build-info found — run `hardhat build` first.");
  process.exit(1);
}

const failures: string[] = [];
let sourceCount = 0;
for (const file of files) {
  const info = JSON.parse(readFileSync(path.join(buildInfoDir, file), "utf8")) as BuildInfo;
  const evm = info.input.settings.evmVersion;
  if (evm !== REQUIRED_EVM) failures.push(`${file}: evmVersion is "${evm ?? "default"}", expected "${REQUIRED_EVM}"`);
  for (const [name, { content }] of Object.entries(info.input.sources)) {
    sourceCount++;
    if (!content) continue;
    // Strip comments so NatSpec mentioning an opcode doesn't trip the check.
    const code = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const match = code.match(CANCUN_BUILTINS);
    if (match) failures.push(`${name}: uses Cancun builtin "${match[1]}"`);
  }
}

if (failures.length) {
  console.error(`✗ Not deployable on MST mainnet (Shanghai):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `✓ ${files.length} compilation(s), ${sourceCount} sources: evmVersion=${REQUIRED_EVM}, no Cancun builtins`,
);
