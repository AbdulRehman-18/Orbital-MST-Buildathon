import { ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import type { Tone } from "@/components/common/tone";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type PanelTab = {
  value: string;
  label: ReactNode;
  icon: LucideIcon;
  tone: Tone;
  count?: number;
};

/**
 * The open tab of a role panel, kept in the URL (`?tab=…`) so Back, refresh and shared links keep it.
 * The first tab is the default and has no query string.
 */
export function usePanelTab(path: string, tabs: readonly string[]) {
  const search = useSearch();
  const [, navigate] = useLocation();
  const fromUrl = new URLSearchParams(search).get("tab");
  const tab = fromUrl && tabs.includes(fromUrl) ? fromUrl : tabs[0];
  const go = (next: string) =>
    navigate(next === tabs[0] ? path : `${path}?tab=${next}`, { replace: true });
  return [tab, go] as const;
}

/**
 * Shell shared by every role's workspace: a grey band with who you are and the main action, a sticky
 * tab bar joined to it, then the tab content (pass `TabsContent` children) in the site column.
 */
export function RolePanel({
  tab,
  onTab,
  tabs,
  badge,
  title,
  subtitle,
  action,
  children,
}: {
  tab: string;
  onTab: (tab: string) => void;
  tabs: PanelTab[];
  /** The tile left of the title: an initial or a role icon. */
  badge: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tabs value={tab} onValueChange={onTab} className="gap-0">
      <div className="bg-muted/50 -mx-4 -mt-6 px-4 sm:-mx-6 sm:px-6 md:-mt-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 py-8 sm:flex-row sm:items-center sm:justify-between md:py-10">
          <div className="flex items-center gap-4">
            {badge}
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">{title}</h1>
              {subtitle && (
                <p className="text-muted-foreground max-w-xl text-sm text-pretty">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>

      <div className="bg-background sticky top-14 z-30 -mx-4 sm:-mx-6">
        <div className="bg-muted/50 border-b px-4 sm:px-6">
          <TabsList
            variant="line"
            className="mx-auto flex h-auto w-full max-w-6xl justify-start gap-1 overflow-x-auto p-0 [scrollbar-width:none]"
          >
            {tabs.map(({ value, label, icon: Icon, tone, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  `tone-${tone}`,
                  "text-muted-foreground hover:text-foreground data-[state=active]:text-foreground h-12 flex-none gap-2 rounded-none px-3 text-sm after:bottom-0! after:h-0.5 data-[state=active]:bg-transparent",
                )}
              >
                <Icon className="text-(--tone-fg)" />
                {label}
                {count !== undefined && (
                  <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-px text-xs tabular-nums">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl pt-8">{children}</div>
    </Tabs>
  );
}

/** A bordered section with a title bar, used for lists inside a panel. */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-2xl border", className)}>
      <div className="flex h-12 items-center justify-between gap-3 border-b px-5">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ViewAll({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-sm transition-colors"
    >
      {t("common.viewAll")} <ChevronRight className="size-4" />
    </button>
  );
}
