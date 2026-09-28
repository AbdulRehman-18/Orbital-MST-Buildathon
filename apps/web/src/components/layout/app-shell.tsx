import { FlaskConical, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConnection, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useDemo } from "@/lib/api";
import { chain, network } from "@/lib/chain";
import { AppSidebar } from "./app-sidebar";
import { LanguageSwitcher } from "./language-switcher";
import { NetworkBadge } from "./network-badge";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

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
    <div className="bg-civic text-civic-foreground flex items-center justify-center gap-2 px-4 py-1 text-center text-xs font-medium">
      <FlaskConical className="size-3.5 shrink-0" /> {t("login.demoBanner")}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <DemoBanner />
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <div className="ml-auto flex items-center gap-1">
            <NetworkBadge />
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <WrongNetworkBanner />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
