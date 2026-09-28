import type { Db } from "@namma-seva/db";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { OtpSender } from "./auth/otp";
import type { RoleReader } from "./auth/roles";
import type { TokenService } from "./auth/tokens";
import type { Config } from "./config";
import type { IpfsService } from "./ipfs/ipfs";
import type { Relayer } from "./relayer/relayer";
import type { Chain } from "./runtime";

/** Everything a request handler may use. Built in `index.ts`; tests build their own. */
export type AppContext = {
  config: Config;
  db: Db;
  logger: Logger;
  tokens: TokenService;
  otp: OtpSender;
  roles: RoleReader;
  ipfs: IpfsService;
  /** Absent only in tests that exercise the read model without a node. */
  chain?: Chain;
  relayer?: Relayer;
  redis?: Redis;
};
