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
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  path: string;
  /** i18n key under `nav.*` */
  labelKey: string;
  icon: LucideIcon;
  /** Phase that delivers this screen (docs/phases). */
  phase: number;
};

export const PUBLIC_NAV: NavItem[] = [
  { path: "/", labelKey: "nav.home", icon: Home, phase: 1 },
  { path: "/projects", labelKey: "nav.projects", icon: Building2, phase: 4 },
  { path: "/verify", labelKey: "nav.verify", icon: Search, phase: 4 },
  { path: "/ledger", labelKey: "nav.ledger", icon: ScrollText, phase: 4 },
  { path: "/tenders", labelKey: "nav.tenders", icon: Gavel, phase: 5 },
];

export const ROLE_NAV: NavItem[] = [
  { path: "/citizen", labelKey: "nav.citizen", icon: Users, phase: 4 },
  { path: "/official", labelKey: "nav.official", icon: Landmark, phase: 4 },
  { path: "/contractor", labelKey: "nav.contractor", icon: HardHat, phase: 4 },
  { path: "/auditor", labelKey: "nav.auditor", icon: ShieldCheck, phase: 4 },
  { path: "/admin", labelKey: "nav.admin", icon: Settings, phase: 4 },
];

export const ALL_NAV = [...PUBLIC_NAV, ...ROLE_NAV];
