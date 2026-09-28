import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain } from "./chain";

/**
 * MetaMask / BridgeKey via the injected connector (EIP-6963 discovery included). Demo burner
 * accounts are connected on the fly (see ./burner.ts). WalletConnect is left out until BridgeKey
 * mobile support is confirmed (plan §21 Q8).
 */
export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http() },
  multiInjectedProviderDiscovery: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
