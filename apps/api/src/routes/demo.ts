import { accountRoles, asc, wardAccess } from "@namma-seva/db";
import { Router, type IRouter } from "express";
import type { AppContext } from "../context";
import { DEMO_ACCOUNTS, DEMO_CITIZENS, demoWallet } from "../demo/accounts";
import { handler } from "../lib/http";

export default function demoRoutes(ctx: AppContext): IRouter {
  const router: IRouter = Router();
  const { config, db } = ctx;

  /**
   * Demo cast for the login screen. Only in NS_DEMO_MODE (refused in production and on mainnet):
   * returns the burner mnemonic so the browser can sign real SIWE messages and transactions.
   */
  router.get(
    "/demo",
    handler(async (_req, res) => {
      if (!config.demoMode || !config.demoMnemonic) {
        res.json({ enabled: false, mnemonic: null, chainId: config.network.id, accounts: [], citizens: [] });
        return;
      }
      const mnemonic = config.demoMnemonic;
      res.json({
        enabled: true,
        mnemonic,
        chainId: config.network.id,
        accounts: DEMO_ACCOUNTS.filter((a) => a.role !== "RELAYER").map((a) => ({
          key: a.key,
          index: a.index,
          role: a.role,
          name: a.name,
          title: a.title,
          address: demoWallet(mnemonic, a.index).address.toLowerCase(),
          wards: a.wards === "ALL" ? [] : a.wards,
          allWards: a.wards === "ALL",
        })),
        citizens: DEMO_CITIZENS.map((c) => ({ key: c.key, name: c.name, area: c.area, phone: c.phone })),
      });
    }),
  );

  /** Role holders and ward scopes as indexed from NammaSevaAccess (public on-chain data). */
  router.get(
    "/roles",
    handler(async (_req, res) => {
      const [roles, wards] = await Promise.all([
        db.select().from(accountRoles).orderBy(asc(accountRoles.role), asc(accountRoles.address)),
        db.select().from(wardAccess).orderBy(asc(wardAccess.address), asc(wardAccess.wardId)),
      ]);
      const byAddress = new Map<string, { address: string; roles: string[]; wards: number[]; allWards: boolean }>();
      const entry = (address: string) => {
        let e = byAddress.get(address);
        if (!e) byAddress.set(address, (e = { address, roles: [], wards: [], allWards: false }));
        return e;
      };
      for (const r of roles) entry(r.address).roles.push(r.role);
      for (const w of wards) {
        if (w.wardId === 0xffffffff) entry(w.address).allWards = true;
        else entry(w.address).wards.push(w.wardId);
      }
      res.json([...byAddress.values()]);
    }),
  );

  return router;
}
