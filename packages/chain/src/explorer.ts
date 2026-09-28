import type { Network } from "./networks";

function base(network: Network): string {
  return network.blockExplorers.default.url.replace(/\/$/, "");
}

export const txUrl = (network: Network, hash: string) => `${base(network)}/tx/${hash}`;
export const addressUrl = (network: Network, address: string) => `${base(network)}/address/${address}`;
export const blockUrl = (network: Network, block: number | bigint) => `${base(network)}/block/${block}`;
