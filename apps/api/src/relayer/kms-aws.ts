// AWS KMS implementation of `KmsClient`. The SDK is loaded lazily so development installs and the
// hot-key path never touch it. Key requirements (see docs/runbooks/relayer-key-rotation.md):
//   signing key: KeySpec ECC_SECG_P256K1, KeyUsage SIGN_VERIFY
//   HMAC key:    KeySpec HMAC_256,        KeyUsage GENERATE_VERIFY_MAC
import type { KmsClient } from "./kms";

export async function createAwsKmsClient(opts: { region?: string; endpoint?: string } = {}): Promise<KmsClient> {
  const { KMSClient, GetPublicKeyCommand, SignCommand, GenerateMacCommand } = await import("@aws-sdk/client-kms");
  const client = new KMSClient({ region: opts.region, endpoint: opts.endpoint });
  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`AWS KMS returned no ${what}`);
    return value;
  };
  return {
    async getPublicKey(keyId) {
      const out = await client.send(new GetPublicKeyCommand({ KeyId: keyId }));
      return need(out.PublicKey, "public key");
    },
    async sign(keyId, digest) {
      const out = await client.send(
        new SignCommand({ KeyId: keyId, Message: digest, MessageType: "DIGEST", SigningAlgorithm: "ECDSA_SHA_256" }),
      );
      return need(out.Signature, "signature");
    },
    async generateMac(keyId, message) {
      const out = await client.send(new GenerateMacCommand({ KeyId: keyId, Message: message, MacAlgorithm: "HMAC_SHA_256" }));
      return need(out.Mac, "MAC");
    },
  };
}
