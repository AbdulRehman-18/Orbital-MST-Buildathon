// Demo cast (NS_DEMO_MODE only). Wallet roles are burner accounts derived from the demo mnemonic —
// on NS_CHAIN=local that is Hardhat's public test mnemonic — so the demo login signs real SIWE
// messages and real transactions; roles come from NammaSevaAccess exactly as in production.
// All people and firms below are fictional.
import { HDNodeWallet, Mnemonic } from "ethers";

export type DemoRole = "ADMIN" | "GOVT_OFFICIAL" | "AUDITOR" | "CONTRACTOR" | "RELAYER";

export type DemoAccount = {
  key: string;
  /** BIP-44 index under m/44'/60'/0'/0 */
  index: number;
  role: DemoRole;
  name: string;
  title: string;
  /** Wards granted on-chain by the seed; "ALL" = every ward. */
  wards: number[] | "ALL";
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: "admin", index: 0, role: "ADMIN", name: "BBMP IT Cell", title: "Platform administrator", wards: "ALL" },
  { key: "official", index: 1, role: "GOVT_OFFICIAL", name: "Priya Rao", title: "Ward Engineer · Koramangala & Bellandur", wards: [150, 151] },
  { key: "official2", index: 6, role: "GOVT_OFFICIAL", name: "Mohan Kumar", title: "Asst. Exec. Engineer · Malleswaram & Yelahanka", wards: [1, 2, 3, 4, 5, 6, 45] },
  { key: "auditor", index: 2, role: "AUDITOR", name: "Anita Desai", title: "Social Audit Unit", wards: "ALL" },
  { key: "auditor2", index: 3, role: "AUDITOR", name: "Rahul Menon", title: "Third-party Quality Auditor", wards: "ALL" },
  { key: "contractor", index: 4, role: "CONTRACTOR", name: "Sri Ganesh Constructions", title: "Class-I civil contractor", wards: [] },
  { key: "contractor2", index: 7, role: "CONTRACTOR", name: "Kaveri Infra Pvt Ltd", title: "Water & drainage works", wards: [] },
  { key: "relayer", index: 5, role: "RELAYER", name: "Gasless relayer", title: "Pays gas for citizens", wards: [] },
];

/** Demo citizens sign in with phone OTP; in demo mode the code is shown on screen. */
export const DEMO_CITIZENS = [
  { key: "citizen", name: "Lakshmi", area: "Koramangala", phone: "+919000000001" },
  { key: "citizen2", name: "Arjun", area: "Malleswaram", phone: "+919000000002" },
  { key: "citizen3", name: "Fatima", area: "Bellandur", phone: "+919000000003" },
  { key: "citizen4", name: "Suresh", area: "Thanisandra", phone: "+919000000004" },
];

export const ALL_WARDS = 0xffffffff;

export function demoWallet(mnemonic: string, index: number): HDNodeWallet {
  return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), `m/44'/60'/0'/0/${index}`);
}

export function demoAccount(key: string): DemoAccount {
  const a = DEMO_ACCOUNTS.find((x) => x.key === key);
  if (!a) throw new Error(`Unknown demo account ${key}`);
  return a;
}
