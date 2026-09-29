import {
  Building2,
  Gavel,
  HardHat,
  Home,
  Landmark,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth";

export type NavItem = {
  path: string;
  /** i18n key under `nav.*` */
  labelKey: string;
  icon: LucideIcon;
};

export const PUBLIC_NAV: NavItem[] = [
  { path: "/", labelKey: "nav.home", icon: Home },
  { path: "/projects", labelKey: "nav.projects", icon: Building2 },
  { path: "/verify", labelKey: "nav.verify", icon: Search },
  { path: "/ledger", labelKey: "nav.ledger", icon: ScrollText },
  { path: "/tenders", labelKey: "nav.tenders", icon: Gavel },
  { path: "/transparency", labelKey: "nav.transparency", icon: ShieldCheck },
];

/** Each role gets exactly one workspace; the sidebar shows only the signed-in user's. */
export const ROLE_NAV: Record<Role, NavItem | null> = {
  CITIZEN: { path: "/citizen", labelKey: "nav.citizen", icon: UserRound },
  GOVT_OFFICIAL: { path: "/official", labelKey: "nav.official", icon: Landmark },
  CONTRACTOR: { path: "/contractor", labelKey: "nav.contractor", icon: HardHat },
  AUDITOR: { path: "/auditor", labelKey: "nav.auditor", icon: ShieldCheck },
  ADMIN: { path: "/admin", labelKey: "nav.admin", icon: Settings },
  PUBLIC: null,
};

export const ROLE_ICON: Record<Role, LucideIcon> = {
  CITIZEN: UserRound,
  GOVT_OFFICIAL: Landmark,
  CONTRACTOR: HardHat,
  AUDITOR: ShieldCheck,
  ADMIN: Settings,
  PUBLIC: UserRound,
};

/** Workspaces a user can open: one per on-chain role they hold (a wallet may hold several). */
export function workspacesFor(roles: Role[]): NavItem[] {
  return roles.map((r) => ROLE_NAV[r]).filter((x): x is NavItem => !!x);
}
