import type { Network } from "./networks";

/** Params for EIP-3085 `wallet_addEthereumChain` (MetaMask, BridgeKey). */
export function addChainParams(network: Network) {
  return {
    chainId: `0x${network.id.toString(16)}`,
    chainName: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: [...network.rpcUrls.default.http],
    blockExplorerUrls: network.blockExplorers.default.url ? [network.blockExplorers.default.url] : [],
  };
}
