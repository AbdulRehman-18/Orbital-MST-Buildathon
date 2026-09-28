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
} from "@/components/ui/sidebar";
import { PUBLIC_NAV, ROLE_NAV, type NavItem } from "./nav";

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const { t } = useTranslation();
  const [location] = useLocation();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton asChild isActive={location === item.path} tooltip={t(item.labelKey)}>
                <Link href={item.path}>
                  <item.icon />
                  <span>{t(item.labelKey)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();

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
                  <span className="text-muted-foreground truncate text-xs">MST Blockchain</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label={t("nav.public")} items={PUBLIC_NAV} />
        <NavGroup label={t("nav.workspaces")} items={ROLE_NAV} />
      </SidebarContent>
      <SidebarFooter>
        <p className="text-muted-foreground px-2 text-xs group-data-[collapsible=icon]:hidden">
          {t("brand.tagline")}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
