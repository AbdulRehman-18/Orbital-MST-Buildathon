import { FlaskConical, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useConnection, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/api";
import { chain, network } from "@/lib/chain";
import { Footer } from "./footer";
import { TopNav } from "./top-nav";

/** Wrong-network guard (plan §11.1): switch, falling back to wallet_addEthereumChain. */
function WrongNetworkBanner() {
  const { t } = useTranslation();
  const connection = useConnection();
  const { mutate: switchChain, isPending } = useSwitchChain();
  if (!connection.isConnected || connection.chainId === chain.id) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <TriangleAlert className="size-4 text-amber-600" />
      <span>{t("network.wrongChain")}</span>
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => switchChain({ chainId: chain.id })}>
        {t("network.switch", { name: network.name })}
      </Button>
    </div>
  );
}

function DemoBanner() {
  const { t } = useTranslation();
  const demo = useDemo();
  if (!demo.data?.enabled) return null;
  return (
    <div className="bg-foreground text-background flex items-center justify-center gap-2 px-4 py-1.5 text-center font-mono text-[11px]">
      <FlaskConical className="size-3.5 shrink-0" /> {t("login.demoBanner")}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  // The landing page lays out its own full-bleed sections; every other page gets the padded column.
  const [location] = useLocation();
  const bare = location === "/";
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="bg-foreground text-background sr-only z-50 px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("nav.skip")}
      </a>
      <DemoBanner />
      <TopNav />
      <WrongNetworkBanner />
      <main id="main" className={bare ? "flex-1" : "flex-1 px-4 pt-6 pb-16 sm:px-6 md:pt-10"}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
