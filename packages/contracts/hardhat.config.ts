import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatTypechain from "@nomicfoundation/hardhat-typechain";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatUpgrades from "@openzeppelin/hardhat-upgrades";
import { configVariable, defineConfig } from "hardhat/config";

// Compiler target is fixed by docs/adr/0003: MST mainnet has Shanghai but not Cancun
// (MCOPY / TSTORE are invalid opcodes there), so every network gets identical Shanghai bytecode.
const EVM_VERSION = "shanghai";
const SOLC = "0.8.24";

const compiler = {
  version: SOLC,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: EVM_VERSION,
  },
};

export default defineConfig({
  plugins: [
    hardhatEthers,
    hardhatChaiMatchers,
    hardhatMocha,
    hardhatNetworkHelpers,
    hardhatTypechain,
    hardhatVerify,
    hardhatUpgrades,
  ],
  solidity: {
    profiles: { default: compiler, production: compiler },
    // Solidity tests (test/*.t.sol) — fuzz & invariant runs.
  },
  test: {
    solidity: {
      fuzz: { runs: 1000 },
      invariant: { runs: 128, depth: 64, failOnRevert: false },
    },
  },
  networks: {
    // Local simulated chain pinned to the same fork as MST mainnet.
    hardhat: { type: "edr-simulated", chainType: "l1", hardfork: EVM_VERSION },
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
    mstTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 91562037,
      url: configVariable("MST_TESTNET_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    mstMainnet: {
      type: "http",
      chainType: "l1",
      chainId: 4646,
      url: configVariable("MST_MAINNET_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
  // Blockscout explorers — see docs/adr/0007.
  chainDescriptors: {
    91562037: {
      name: "MST Testnet",
      chainType: "l1",
      blockExplorers: {
        blockscout: {
          name: "mstscan (testnet)",
          url: "https://testnet.mstscan.com",
          apiUrl: "https://testnet.mstscan.com/api",
        },
      },
    },
    4646: {
      name: "MST Mainnet",
      chainType: "l1",
      blockExplorers: {
        blockscout: {
          name: "mstscan",
          url: "https://mstscan.com",
          apiUrl: "https://mstscan.com/api",
        },
      },
    },
  },
});
