// Prints the Ethereum address of a KMS signing key, and proves the key can sign and the HMAC key can MAC.
// Use it to (a) grant RELAYER_ROLE / fund the relayer, (b) smoke-test a rotated key before cut-over.
//   AWS_REGION=ap-south-1 pnpm --filter @namma-seva/api kms:address <signing-key-id> [<hmac-key-id>]
import { hashMessage, verifyMessage } from "ethers";
import { createAwsKmsClient } from "./kms-aws";
import { KmsSigner } from "./kms";

const [keyId, hmacKeyId] = process.argv.slice(2);
if (!keyId) {
  console.error("usage: kms:address <signing-key-id> [<hmac-key-id>]");
  process.exit(1);
}

const kms = await createAwsKmsClient({ region: process.env.AWS_REGION, endpoint: process.env.RELAYER_KMS_ENDPOINT });
const signer = await KmsSigner.create(kms, keyId);
const proof = await signer.signMessage("namma-seva kms self-test");
if (verifyMessage("namma-seva kms self-test", proof) !== signer.address) throw new Error("KMS signature does not verify");
console.log(`relayer address : ${signer.address}`);
console.log(`self-test       : signed and verified (${hashMessage("namma-seva kms self-test").slice(0, 10)}…)`);
if (hmacKeyId) {
  const mac = await kms.generateMac(hmacKeyId, new TextEncoder().encode("self-test"));
  console.log(`hmac key        : ok (${mac.length}-byte MAC)`);
}
