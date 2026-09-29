// Key custody for the relayer (plan §16.2): the gas-paying signing key and the citizen-key
// derivation secret live in a KMS/HSM and are never present in this process. Cloud-agnostic
// surface (`KmsClient`); `kms-aws.ts` implements it for AWS KMS (secp256k1 signing key + HMAC key).
import {
  AbstractSigner,
  assertArgument,
  getAddress,
  getBytes,
  hashMessage,
  hexlify,
  keccak256,
  recoverAddress,
  resolveAddress,
  Signature,
  toBeHex,
  Transaction,
  TypedDataEncoder,
  type Provider,
  type Signer,
  type TransactionLike,
  type TransactionRequest,
  type TypedDataDomain,
  type TypedDataField,
} from "ethers";

/** The three KMS operations we need. Digests are 32 bytes; the signature is ASN.1 DER ECDSA. */
export interface KmsClient {
  /** DER SubjectPublicKeyInfo of the secp256k1 signing key. */
  getPublicKey(keyId: string): Promise<Uint8Array>;
  /** ECDSA over the given 32-byte digest (no further hashing). */
  sign(keyId: string, digest: Uint8Array): Promise<Uint8Array>;
  /** HMAC-SHA-256 with the KMS-held HMAC key. */
  generateMac(keyId: string, message: Uint8Array): Promise<Uint8Array>;
}

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Ethereum address of a DER SubjectPublicKeyInfo holding an uncompressed secp256k1 key. */
export function addressFromSpki(spki: Uint8Array): string {
  // SPKI ends with the BIT STRING payload: 0x04 ‖ X(32) ‖ Y(32).
  const point = spki.slice(spki.length - 65);
  assertArgument(point.length === 65 && point[0] === 0x04, "not an uncompressed secp256k1 public key", "spki", hexlify(spki));
  return getAddress("0x" + keccak256(point.slice(1)).slice(-40));
}

function readDerLength(der: Uint8Array, at: number): [length: number, next: number] {
  const first = der[at];
  if (first < 0x80) return [first, at + 1];
  const bytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < bytes; i++) length = (length << 8) | der[at + 1 + i];
  return [length, at + 1 + bytes];
}

/** Parse `SEQUENCE { INTEGER r, INTEGER s }`. */
export function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  assertArgument(der[0] === 0x30, "not a DER sequence", "signature", hexlify(der));
  let [, at] = readDerLength(der, 1);
  const ints: bigint[] = [];
  for (let i = 0; i < 2; i++) {
    assertArgument(der[at] === 0x02, "expected DER INTEGER", "signature", hexlify(der));
    const [len, start] = readDerLength(der, at + 1);
    ints.push(BigInt(hexlify(der.slice(start, start + len))));
    at = start + len;
  }
  return { r: ints[0], s: ints[1] };
}

/**
 * ethers Signer backed by a KMS secp256k1 key. Build with `KmsSigner.create` so the address is
 * resolved once at startup (the rest of the relayer reads `address` synchronously).
 */
export class KmsSigner extends AbstractSigner {
  private constructor(
    private readonly kms: KmsClient,
    private readonly keyId: string,
    readonly address: string,
    provider?: Provider | null,
  ) {
    super(provider);
  }

  static async create(kms: KmsClient, keyId: string, provider?: Provider | null): Promise<KmsSigner> {
    return new KmsSigner(kms, keyId, addressFromSpki(await kms.getPublicKey(keyId)), provider);
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  connect(provider: Provider | null): Signer {
    return new KmsSigner(this.kms, this.keyId, this.address, provider);
  }

  private async signDigest(digest: string): Promise<Signature> {
    const { r, s: rawS } = parseDerSignature(await this.kms.sign(this.keyId, getBytes(digest)));
    // Ethereum rejects high-s signatures (EIP-2); KMS may return either form.
    const s = rawS > SECP256K1_N / 2n ? SECP256K1_N - rawS : rawS;
    const rHex = toBeHex(r, 32);
    const sHex = toBeHex(s, 32);
    for (const v of [27, 28] as const) {
      if (recoverAddress(digest, { r: rHex, s: sHex, v }) === this.address) return Signature.from({ r: rHex, s: sHex, v });
    }
    throw new Error("KMS signature does not recover to the key's address — wrong key id or corrupt signature");
  }

  async signTransaction(tx: TransactionRequest): Promise<string> {
    const { to, from } = await Promise.all([tx.to ? resolveAddress(tx.to, this.provider) : null, tx.from ? resolveAddress(tx.from, this.provider) : null]).then(
      ([t, f]) => ({ to: t, from: f }),
    );
    if (to !== null) tx.to = to;
    if (from !== null) {
      assertArgument(getAddress(from) === this.address, "transaction from address mismatch", "tx.from", from);
      tx.from = from;
    }
    const unsigned = Transaction.from(tx as TransactionLike<string>);
    unsigned.signature = await this.signDigest(unsigned.unsignedHash);
    return unsigned.serialized;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return (await this.signDigest(hashMessage(message))).serialized;
  }

  async signTypedData(domain: TypedDataDomain, types: Record<string, TypedDataField[]>, value: Record<string, unknown>): Promise<string> {
    const resolved = await TypedDataEncoder.resolveNames(domain, types, value, async (name) => resolveAddress(name, this.provider));
    return (await this.signDigest(TypedDataEncoder.hash(resolved.domain, types, resolved.value))).serialized;
  }
}
