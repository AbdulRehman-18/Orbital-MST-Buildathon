// MST network definitions. Values come from the ethereum-lists/chains registry and were
// verified against the live RPCs on 2026-09-28 (see docs/adr/0002).
// The shape matches viem's `Chain`, so `defineChain(MST_TESTNET)` works in the web app.

export const MST_TESTNET = {
  id: 91562037,
  name: "MST Testnet",
  nativeCurrency: { name: "MST Native Coin", symbol: "tMSTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://testnetrpc.mstblockchain.com"],
      webSocket: ["wss://testnetrpc.mstblockchain.com"],
    },
  },
  blockExplorers: { default: { name: "mstscan", url: "https://testnet.mstscan.com" } },
  testnet: true,
} as const;

export const MST_MAINNET = {
  id: 4646,
  name: "MST Mainnet",
  nativeCurrency: { name: "MST Native Coin", symbol: "MSTC", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://mariorpc.mstblockchain.com", "https://craftrpc.mstblockchain.com"],
      webSocket: ["wss://mariorpc.mstblockchain.com", "wss://craftrpc.mstblockchain.com"],
    },
  },
  blockExplorers: { default: { name: "mstscan", url: "https://mstscan.com" } },
  testnet: false,
} as const;

export const LOCAL = {
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"], webSocket: ["ws://127.0.0.1:8545"] },
  },
  blockExplorers: { default: { name: "local", url: "" } },
  testnet: true,
} as const;

export const NETWORKS = {
  local: LOCAL,
  mstTestnet: MST_TESTNET,
  mstMainnet: MST_MAINNET,
} as const;

export type NetworkName = keyof typeof NETWORKS;
export type Network = (typeof NETWORKS)[NetworkName];

/** Blocks to wait before treating an event as final (~3 s blocks → ~18 s). See docs/adr/0004. */
export const DEFAULT_CONFIRMATIONS = 6;

/** Highest EVM fork live on *both* MST networks (mainnet lacks Cancun). See docs/adr/0003. */
export const EVM_VERSION = "shanghai";

export function isNetworkName(value: string): value is NetworkName {
  return value in NETWORKS;
}

export function getNetwork(name: string): Network {
  if (!isNetworkName(name)) {
    throw new Error(`Unknown network "${name}". Expected one of: ${Object.keys(NETWORKS).join(", ")}`);
  }
  return NETWORKS[name];
}

export function getNetworkByChainId(chainId: number): Network | undefined {
  return Object.values(NETWORKS).find((n) => n.id === chainId);
}
