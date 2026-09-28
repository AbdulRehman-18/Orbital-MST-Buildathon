import { getNetwork, type Network } from "@namma-seva/chain";

/** Network the web app targets, from VITE_NS_CHAIN (defaults to MST testnet). */
export const network: Network = getNetwork(import.meta.env.VITE_NS_CHAIN ?? "mstTestnet");
