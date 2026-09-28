// Deploys and wires the full Namma Seva contract system. Shared by scripts/deploy.ts, the smoke
// test and the TypeScript test fixtures so every environment is deployed the same way.
import type { HardhatEthers } from "@nomicfoundation/hardhat-ethers/types";
import type { upgrades } from "@openzeppelin/hardhat-upgrades";
import type {
  GrievanceRegistry,
  MilestoneEscrow,
  NammaSevaAccess,
  ProjectRegistry,
  TenderRegistry,
  TrustedForwarder,
} from "../../types/ethers-contracts/index.js";

export type UpgradesApi = Awaited<ReturnType<typeof upgrades>>;

/** Must match `MilestoneEscrow.Mode`. */
export const Mode = { LEDGER: 0, ESCROW: 1 } as const;
export type ModeName = keyof typeof Mode;

export type SystemOptions = {
  /** ADMIN during setup (the deployer). Handover to the timelock is a separate step. */
  admin: string;
  mode: ModeName;
  treasury: string;
  grievance: { escalationThreshold: number; maxPerDay: number; responseSlaSeconds: number };
  /** Log each step (scripts) or stay quiet (tests). */
  log?: (message: string) => void;
};

export type System = {
  access: NammaSevaAccess;
  forwarder: TrustedForwarder;
  registry: ProjectRegistry;
  escrow: MilestoneEscrow;
  grievance: GrievanceRegistry;
  tender: TenderRegistry;
};

export const DEFAULT_GRIEVANCE = { escalationThreshold: 25, maxPerDay: 3, responseSlaSeconds: 7 * 24 * 60 * 60 };

export async function deploySystem(ethers: HardhatEthers, upgradesApi: UpgradesApi, opts: SystemOptions): Promise<System> {
  const log = opts.log ?? (() => {});
  const uups = { kind: "uups" as const };

  const access = (await ethers.deployContract("NammaSevaAccess", [opts.admin])) as unknown as NammaSevaAccess;
  await access.waitForDeployment();
  log(`NammaSevaAccess   ${await access.getAddress()}`);

  const forwarder = (await ethers.deployContract("TrustedForwarder")) as unknown as TrustedForwarder;
  await forwarder.waitForDeployment();
  log(`TrustedForwarder  ${await forwarder.getAddress()}`);

  const accessAddr = await access.getAddress();

  const registry = (await upgradesApi.deployProxy(
    await ethers.getContractFactory("ProjectRegistry"),
    [accessAddr],
    uups,
  )) as unknown as ProjectRegistry;
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  log(`ProjectRegistry   ${registryAddr} (proxy)`);

  const escrow = (await upgradesApi.deployProxy(
    await ethers.getContractFactory("MilestoneEscrow"),
    [accessAddr, registryAddr, Mode[opts.mode], opts.treasury],
    uups,
  )) as unknown as MilestoneEscrow;
  await escrow.waitForDeployment();
  log(`MilestoneEscrow   ${await escrow.getAddress()} (proxy, ${opts.mode} mode)`);

  const grievance = (await upgradesApi.deployProxy(
    await ethers.getContractFactory("GrievanceRegistry"),
    [
      accessAddr,
      registryAddr,
      opts.grievance.escalationThreshold,
      opts.grievance.maxPerDay,
      opts.grievance.responseSlaSeconds,
    ],
    { ...uups, constructorArgs: [await forwarder.getAddress()] },
  )) as unknown as GrievanceRegistry;
  await grievance.waitForDeployment();
  log(`GrievanceRegistry ${await grievance.getAddress()} (proxy)`);

  const tender = (await upgradesApi.deployProxy(
    await ethers.getContractFactory("TenderRegistry"),
    [accessAddr, registryAddr],
    uups,
  )) as unknown as TenderRegistry;
  await tender.waitForDeployment();
  log(`TenderRegistry    ${await tender.getAddress()} (proxy)`);

  await (await registry.setEscrow(await escrow.getAddress())).wait();
  await (await registry.setTenderRegistry(await tender.getAddress())).wait();
  await (await registry.setGrievanceRegistry(await grievance.getAddress())).wait();
  log("Registry wired to escrow, tender and grievance registries");

  return { access, forwarder, registry, escrow, grievance, tender };
}
