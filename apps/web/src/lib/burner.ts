// DEMO ONLY: a wagmi connector backed by an in-browser burner key derived from the demo mnemonic
// served by `GET /api/demo` (NS_DEMO_MODE; Hardhat's public test mnemonic on a local chain).
// It signs SIWE messages and sends real transactions, so demo roles exercise exactly the same
// code paths as MetaMask / BridgeKey users.
import { createConnector } from "wagmi";
import {
  createWalletClient,
  fromHex,
  getAddress,
  http,
  numberToHex,
  type Chain,
  type EIP1193RequestFn,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

export type BurnerParams = { mnemonic: string; index: number; name: string };

type Tx = { to?: Hex; data?: Hex; value?: Hex; gas?: Hex };

export function burner({ mnemonic, index, name }: BurnerParams) {
  const account = mnemonicToAccount(mnemonic, { addressIndex: index });
  let connected = false;

  return createConnector((config) => {
    const chain = config.chains[0] as Chain;
    const rpc = chain.rpcUrls.default.http[0];
    const wallet = createWalletClient({ account, chain, transport: http(rpc) });

    const request = (async ({ method, params }: { method: string; params?: unknown[] }) => {
      switch (method) {
        case "eth_chainId":
          return numberToHex(chain.id);
        case "eth_accounts":
        case "eth_requestAccounts":
          return [account.address];
        case "personal_sign": {
          const [message] = params as [Hex];
          return account.signMessage({ message: { raw: message } });
        }
        case "eth_signTypedData_v4": {
          const [, json] = params as [string, string];
          return account.signTypedData(JSON.parse(json));
        }
        case "eth_sendTransaction": {
          const [tx] = params as [Tx];
          return wallet.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ? fromHex(tx.value, "bigint") : undefined,
            gas: tx.gas ? fromHex(tx.gas, "bigint") : undefined,
          });
        }
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        default:
          return fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
          })
            .then((r) => r.json())
            .then((r: { result?: unknown; error?: { message: string } }) => {
              if (r.error) throw new Error(r.error.message);
              return r.result;
            });
      }
    }) as unknown as EIP1193RequestFn;

    const provider = { request, on: () => {}, removeListener: () => {} };

    return {
      id: `burner-${index}`,
      name: `Demo · ${name}`,
      type: "burner",
      async setup() {},
      async connect({ withCapabilities }: { withCapabilities?: boolean } = {}) {
        connected = true;
        const address = getAddress(account.address);
        return {
          accounts: (withCapabilities ? [{ address, capabilities: {} }] : [address]) as never,
          chainId: chain.id,
        };
      },
      async disconnect() {
        connected = false;
      },
      async getAccounts() {
        return connected ? [getAddress(account.address)] : [];
      },
      async getChainId() {
        return chain.id;
      },
      async getProvider() {
        return provider;
      },
      async isAuthorized() {
        return connected;
      },
      async switchChain() {
        return chain;
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        connected = false;
        config.emitter.emit("disconnect");
      },
    };
  });
}
