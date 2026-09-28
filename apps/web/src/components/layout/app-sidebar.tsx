import { LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { LogoMark } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { network } from "@/lib/chain";
import { PUBLIC_NAV, workspacesFor, type NavItem } from "./nav";

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.path === "/" ? location === "/" : location.startsWith(item.path);
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton asChild isActive={active} tooltip={t(item.labelKey)} size="lg" className="h-10">
                  <Link href={item.path} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  const workspaces = user ? workspacesFor(user.roles) : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <LogoMark className="size-8 shrink-0" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">{t("brand.name")}</span>
                  <span className="text-muted-foreground truncate text-xs">{network.name}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {workspaces.length > 0 && <NavGroup label={t("nav.workspace")} items={workspaces} />}
        <NavGroup label={t("nav.public")} items={PUBLIC_NAV} />
        {status === "anonymous" && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t("nav.signIn")} className="bg-primary/10 text-primary hover:bg-primary/15 h-10">
                  <Link href="/login">
                    <LogIn />
                    <span>{t("nav.signIn")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <p className="text-muted-foreground px-2 text-xs group-data-[collapsible=icon]:hidden">{t("brand.tagline")}</p>
      </SidebarFooter>
    </Sidebar>
  );
}
