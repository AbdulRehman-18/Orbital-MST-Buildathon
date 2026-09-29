import {
  Building2,
  Clock,
  Droplets,
  HardHat,
  Landmark,
  Lightbulb,
  MessageSquareWarning,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Trees,
  TrafficCone,
  Users,
  Waves,
  Hammer,
  CircleHelp,
  CircleOff,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "blue" | "sky" | "teal" | "green" | "amber" | "rose" | "violet" | "slate";

const SIZES = {
  sm: "size-8 rounded-lg [&_svg]:size-4",
  md: "size-10 rounded-xl [&_svg]:size-5",
  lg: "size-12 rounded-xl [&_svg]:size-6",
} as const;

/** A soft coloured tile holding one lucide icon (shadcn's icon set). Decorative: hidden from assistive tech. */
export function ToneIcon({ icon: Icon, tone, size = "md", className }: { icon: LucideIcon; tone: Tone; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("tone tone-" + tone, "inline-flex shrink-0 items-center justify-center", SIZES[size], className)}>
      <Icon />
    </span>
  );
}

type Visual = { icon: LucideIcon; tone: Tone };

export const CATEGORY_VISUAL: Record<string, Visual> = {
  ROAD: { icon: TrafficCone, tone: "amber" },
  DRAINAGE: { icon: Waves, tone: "teal" },
  WATER_SUPPLY: { icon: Droplets, tone: "sky" },
  STREET_LIGHTING: { icon: Lightbulb, tone: "amber" },
  PARK: { icon: Trees, tone: "green" },
  BUILDING: { icon: Building2, tone: "violet" },
  OTHER: { icon: Building2, tone: "slate" },
};

export const GRIEVANCE_VISUAL: Record<string, Visual> = {
  QUALITY: { icon: Hammer, tone: "amber" },
  DELAY: { icon: Clock, tone: "sky" },
  SAFETY: { icon: ShieldAlert, tone: "rose" },
  MISSING_WORK: { icon: CircleOff, tone: "violet" },
  CORRUPTION: { icon: Scale, tone: "rose" },
  OTHER: { icon: CircleHelp, tone: "slate" },
};

export const ROLE_VISUAL: Record<string, Visual> = {
  CITIZEN: { icon: Users, tone: "teal" },
  GOVT_OFFICIAL: { icon: Landmark, tone: "blue" },
  CONTRACTOR: { icon: HardHat, tone: "amber" },
  AUDITOR: { icon: ShieldCheck, tone: "violet" },
  ADMIN: { icon: Settings, tone: "slate" },
  PUBLIC: { icon: Users, tone: "slate" },
};

export const COMPLAINT_ICON = MessageSquareWarning;
