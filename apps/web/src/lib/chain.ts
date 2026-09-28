import { getNetwork, type Network } from "@namma-seva/chain";
import { defineChain, type Chain } from "viem";

/** Network the web app targets, from VITE_NS_CHAIN (defaults to MST testnet). */
export const network: Network = getNetwork(import.meta.env.VITE_NS_CHAIN ?? "mstTestnet");

/** viem chain for wagmi (packages/chain networks already have viem's `Chain` shape). */
export const chain: Chain = defineChain({
  ...network,
  id: network.id as number,
  rpcUrls: { default: { http: [...network.rpcUrls.default.http] } },
  blockExplorers: network.blockExplorers.default.url ? network.blockExplorers : undefined,
});

/** VITE_NS_EXPLORER_URL wins; empty on a local chain (no explorer). */
const explorerBase = (import.meta.env.VITE_NS_EXPLORER_URL ?? network.blockExplorers.default.url ?? "").replace(/\/$/, "");

export const hasExplorer = explorerBase !== "";
export const explorerTx = (hash: string) => (hasExplorer ? `${explorerBase}/tx/${hash}` : undefined);
export const explorerAddress = (addr: string) => (hasExplorer ? `${explorerBase}/address/${addr}` : undefined);
export const explorerBlock = (n: number) => (hasExplorer ? `${explorerBase}/block/${n}` : undefined);

/** IPFS content: pinned metadata and dev pins are served by the API; photos via the gateway if set. */
const gateway = (import.meta.env.VITE_NS_IPFS_GATEWAY ?? "").replace(/\/$/, "");
export const ipfsUrl = (cid: string, { preferGateway = false } = {}) =>
  preferGateway && gateway && !gateway.includes("<") ? `${gateway}/ipfs/${cid}` : `/api/ipfs/${cid}`;

export const ALL_WARDS = 0xffffffff;
