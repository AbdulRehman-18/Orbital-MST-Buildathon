// ERC-2771 meta-transactions through `TrustedForwarder` (OZ ERC2771Forwarder, EIP-712 domain
// "NammaSevaForwarder" v1) and the per-citizen signing keys that sign them (plan §9.4).
import { createHmac } from "node:crypto";
import { getBytes, Wallet, type Signer, type TypedDataDomain } from "ethers";

export const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
};

export type ForwardRequestData = {
  from: string;
  to: string;
  value: bigint;
  gas: bigint;
  deadline: number;
  data: string;
  signature: string;
};

export function forwarderDomain(chainId: number, forwarder: string): TypedDataDomain {
  return { name: "NammaSevaForwarder", version: "1", chainId, verifyingContract: forwarder };
}

/** Signs a ForwardRequest; the result is passed as-is to `TrustedForwarder.execute`. */
export async function signForwardRequest(
  signer: Signer,
  domain: TypedDataDomain,
  req: { to: string; data: string; gas: bigint; nonce: bigint; deadline: number },
): Promise<ForwardRequestData> {
  const from = await signer.getAddress();
  const message = { from, to: req.to, value: 0n, gas: req.gas, nonce: req.nonce, deadline: req.deadline, data: req.data };
  const signature = await signer.signTypedData(domain, FORWARD_REQUEST_TYPES, message);
  return { from, to: req.to, value: 0n, gas: req.gas, deadline: req.deadline, data: req.data, signature };
}

const CITIZEN_KEY_DOMAIN = "namma-seva/citizen-signer/v1";

/**
 * Deterministic per-citizen signing key: HMAC-SHA256(rootKey, domain ‖ citizenHash). The key is
 * derived on demand from the relayer's key material and never stored or returned, so no extra
 * secret is configured (exit criterion: only the relayer key exists). When the relayer moves to KMS
 * (Phase 6) this becomes a KMS HMAC key.
 */
export function deriveCitizenWallet(rootPrivateKey: string, citizenHash: string): Wallet {
  const key = createHmac("sha256", Buffer.from(getBytes(rootPrivateKey)))
    .update(CITIZEN_KEY_DOMAIN)
    .update(Buffer.from(getBytes(citizenHash)))
    .digest();
  return new Wallet("0x" + key.toString("hex"));
}
