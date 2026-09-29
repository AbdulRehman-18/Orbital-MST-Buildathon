import { getProjectStats, getGetProjectStatsQueryKey, listGrievances, listProjects, listWards, type Grievance, type Project, type Ward } from "@namma-seva/api-client";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Camera,
  ClipboardList,
  Droplets,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  Megaphone,
  MessageSquareWarning,
  School,
  ThumbsUp,
  TrafficCone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Amount } from "@/components/common/bits";
import { ProjectMap } from "@/components/common/project-map";
import { STATUS_COLOR, StatusBadge } from "@/components/common/status-badge";
import { CATEGORY_VISUAL, GRIEVANCE_VISUAL, ROLE_VISUAL, ToneIcon, type Tone } from "@/components/common/tone";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi, useDemo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { wardName } from "@/lib/wards";

const WHO = [
  { role: "CITIZEN", body: "home.whoCitizen" },
  { role: "GOVT_OFFICIAL", body: "home.whoOfficial" },
  { role: "CONTRACTOR", body: "home.whoContractor" },
  { role: "AUDITOR", body: "home.whoAuditor" },
] as const;

const STEPS: { key: "how1" | "how2" | "how3"; icon: LucideIcon; tone: Tone }[] = [
  { key: "how1", icon: ClipboardList, tone: "blue" },
  { key: "how2", icon: Camera, tone: "amber" },
  { key: "how3", icon: Megaphone, tone: "green" },
];

/**
 * Every section shares this one column, and it is the same column the header, the footer and the
 * inner pages use (`max-w-6xl` inside a 16/24px page gutter), so left and right edges line up
 * from the logo to the last row.
 */
function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="px-4 sm:px-6">
      <div className={cn("mx-auto max-w-6xl", className)}>{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="max-w-xl text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">{children}</h2>;
}

/** Shared row grid so every preview row lines up: icon, text, progress or votes, status. */
const ROW = "hover:bg-muted/60 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3.5 transition-colors sm:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_9.5rem] sm:gap-x-6 sm:px-6";

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const stats = useApi(getGetProjectStatsQueryKey({}), () => getProjectStats({}));
  const projects = useApi(["/api/projects", "map"], () => listProjects({ limit: 200 }));
  const grievances = useApi(["/api/grievances", "recent"], () => listGrievances({ limit: 5 }));
  const wards = useApi(["/api/wards"], () => listWards());
  const items = projects.data?.items ?? [];
  const lang = i18n.language;

  return (
    <div>
      <Hero wards={wards.data} lang={lang} />

      {/* Product preview: the real data, three ways. */}
      <section className="from-muted/70 to-background border-y bg-gradient-to-b py-14 sm:py-20">
        <Container>
          <Tabs defaultValue="projects" className="gap-8">
            <TabsList variant="line" className="h-auto w-full flex-wrap justify-center gap-2 p-0">
              <PreviewTab value="projects" icon={Building2} tone="blue">
                {t("home.tabProjects")}
              </PreviewTab>
              <PreviewTab value="map" icon={MapIcon} tone="green">
                {t("home.tabMap")}
              </PreviewTab>
              <PreviewTab value="complaints" icon={MessageSquareWarning} tone="amber">
                {t("home.tabComplaints")}
              </PreviewTab>
            </TabsList>

            <div>
              <div className="bg-background h-[27rem] overflow-hidden rounded-2xl border shadow-[0_24px_60px_-32px_rgb(0_0_0/0.3)]">
                <TabsContent value="projects" className="h-full">
                  <ProjectRows items={items.slice(0, 5)} wards={wards.data} lang={lang} loading={projects.isLoading} />
                </TabsContent>
                <TabsContent value="map" className="h-full">
                  <ProjectMap projects={items} className="mono-map h-full rounded-none border-0" locate />
                </TabsContent>
                <TabsContent value="complaints" className="h-full">
                  <ComplaintRows
                    items={grievances.data ?? []}
                    titles={new Map(items.map((p) => [p.id, p.title ?? `#${p.id}`]))}
                    loading={grievances.isLoading}
                  />
                </TabsContent>
              </div>
              <TabsContent value="projects" className="mt-0">
                <Caption icon={Building2} tone="blue" title={t("home.capProjects")} body={t("home.capProjectsBody")} href="/projects" cta={t("home.ctaExplore")} />
              </TabsContent>
              <TabsContent value="map" className="mt-0">
                <Caption icon={MapIcon} tone="green" title={t("home.capMap")} body={t("home.capMapBody")} href="/projects" cta={t("home.ctaExplore")} />
              </TabsContent>
              <TabsContent value="complaints" className="mt-0">
                <Caption icon={MessageSquareWarning} tone="amber" title={t("home.capComplaints")} body={t("home.capComplaintsBody")} href="/login" cta={t("home.ctaReport")} />
              </TabsContent>
            </div>
          </Tabs>
        </Container>
      </section>

      {/* City totals */}
      <section aria-label={t("home.statsLabel")} className="border-b py-14 sm:py-20">
        <Container>
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border lg:grid-cols-4">
            <Stat icon={Building2} tone="blue" label={t("home.statProjects")} loading={stats.isLoading}>
              {stats.data?.totalProjects ?? 0}
            </Stat>
            <Stat icon={Wallet} tone="violet" label={t("home.statBudget")} loading={stats.isLoading}>
              <Amount value={stats.data?.totalBudget} compact />
            </Stat>
            <Stat icon={BadgeCheck} tone="green" label={t("home.statSpent")} loading={stats.isLoading}>
              <Amount value={stats.data?.totalSpent} compact />
            </Stat>
            <Stat icon={MessageSquareWarning} tone="amber" label={t("home.statGrievances")} loading={stats.isLoading}>
              {stats.data?.openGrievances ?? 0}
            </Stat>
          </div>
        </Container>
      </section>

      {/* Statement */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden="true" className="bg-lattice pointer-events-none absolute inset-0" />
        <Container className="relative">
          <FloatingTile icon={TrafficCone} tone="amber" className="top-12 left-[4%] -rotate-12" />
          <FloatingTile icon={Droplets} tone="sky" className="top-8 right-[6%] rotate-12" />
          <FloatingTile icon={School} tone="violet" className="bottom-10 left-[12%] rotate-6" />
          <FloatingTile icon={Lightbulb} tone="green" className="right-[4%] bottom-12 -rotate-6" />
          <p className="mx-auto max-w-3xl py-28 text-center text-3xl leading-[1.2] font-medium tracking-[-0.03em] text-balance sm:py-36 sm:text-5xl">
            {t("home.statementLine1")} <span className="text-muted-foreground">{t("home.statementLine2")}</span>
          </p>
        </Container>
      </section>

      {/* How it works: an actual sequence, so the steps are numbered. */}
      <section className="border-b py-16 sm:py-24">
        <Container className="flex flex-col gap-12">
          <SectionTitle>{t("home.howTitle")}</SectionTitle>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(({ key, icon, tone }, i) => (
              <li key={key} className="bg-muted/40 flex flex-col gap-6 rounded-2xl border p-6">
                <div className="flex items-center justify-between">
                  <ToneIcon icon={icon} tone={tone} size="lg" />
                  <span className="text-muted-foreground bg-background flex size-8 items-center justify-center rounded-full border text-sm font-medium tabular-nums">{i + 1}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl font-medium tracking-tight">{t(`home.${key}Title`)}</h3>
                  <p className="text-muted-foreground text-pretty">{t(`home.${key}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Who it is for */}
      <section className="border-b py-16 sm:py-24">
        <Container className="flex flex-col gap-12">
          <SectionTitle>{t("home.whoTitle")}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHO.map(({ role, body }) => (
              <Link
                key={role}
                href="/login"
                aria-label={t(`roles.${role}`)}
                className="hover:bg-muted/60 group flex flex-col gap-6 rounded-2xl border p-6 transition-colors"
              >
                <ToneIcon icon={ROLE_VISUAL[role].icon} tone={ROLE_VISUAL[role].tone} size="lg" />
                <span className="flex flex-1 flex-col gap-2">
                  <span className="text-lg font-medium tracking-tight">{t(`roles.${role}`)}</span>
                  <span className="text-muted-foreground text-sm text-pretty">{t(body)}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium">
                  {t("home.whoCta")} <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Trust */}
      <section className="py-8 sm:py-12">
        <Container>
          <div className="bg-foreground text-background relative overflow-hidden rounded-3xl">
            <div aria-hidden="true" className="bg-lattice-inverse pointer-events-none absolute inset-0" />
            <div className="relative flex flex-col items-center gap-6 px-6 py-20 text-center sm:py-28">
              <h2 className="max-w-2xl text-3xl leading-[1.1] font-medium tracking-[-0.035em] text-balance sm:text-5xl">{t("home.safeTitle")}</h2>
              <p className="max-w-xl text-lg text-white/70 text-pretty">{t("home.safeBody")}</p>
              <Button size="lg" className="border-background bg-background text-foreground hover:bg-foreground hover:text-background mt-2" asChild>
                <Link href="/transparency">{t("home.safeCta")}</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}

/** Centred headline with a ward finder: the one thing a resident wants to do first. */
function Hero({ wards, lang }: { wards: Ward[] | undefined; lang: string }) {
  const { t } = useTranslation();
  const demo = useDemo();
  const { status } = useAuth();
  const [, navigate] = useLocation();
  const [ward, setWard] = useState("");

  const go = (e: FormEvent) => {
    e.preventDefault();
    navigate(ward ? `/ward/${ward}` : "/projects");
  };

  return (
    <section className="relative overflow-hidden px-4 sm:px-6">
      <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center pt-16 pb-20 text-center sm:pt-24 sm:pb-28">
        <div className="animate-rise bg-background mb-8 inline-flex items-center rounded-full border text-[13px] shadow-xs">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 font-medium">
            <span className="tone-green size-1.5 rounded-full bg-(--tone-fg)" aria-hidden="true" />
            {t("home.heroPill")}
          </span>
          <Link href="/verify" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 border-l px-3.5 py-1.5 transition-colors">
            {t("home.ctaVerify")} <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <h1 className="animate-rise text-[clamp(2.5rem,6.4vw,4.5rem)] leading-[1.04] font-medium tracking-[-0.04em] text-balance [animation-delay:60ms]">
          {t("home.heroTitle")}
        </h1>
        <p className="animate-rise text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed text-pretty [animation-delay:120ms]">{t("home.heroBodyPlain")}</p>

        <form
          onSubmit={go}
          className="animate-rise bg-background mt-10 flex w-full max-w-lg flex-col gap-2 rounded-2xl border p-2 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)] [animation-delay:180ms] sm:flex-row"
        >
          <Select value={ward} onValueChange={setWard}>
            <SelectTrigger aria-label={t("home.findWard")} className="h-11 flex-1 justify-start gap-3 border-0 text-base shadow-none focus-visible:ring-0 [&>svg:last-child]:ml-auto">
              <MapPin className="tone-blue size-5 text-(--tone-fg)" />
              <SelectValue placeholder={t("home.findWard")} />
            </SelectTrigger>
            <SelectContent>
              {wards?.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.id} · {wardName(w, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" size="lg" className="h-11">
            {t("home.findCta")}
          </Button>
        </form>

        {demo.data?.enabled && status !== "signed-in" && (
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground animate-rise mt-6 inline-flex items-center gap-1 text-sm underline underline-offset-4 [animation-delay:240ms]"
          >
            {t("home.ctaDemo")} <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

function PreviewTab({ value, icon: Icon, tone, children }: { value: string; icon: LucideIcon; tone: Tone; children: string }) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "tone-" + tone,
        "bg-background text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground/30 h-10 flex-none gap-2 rounded-lg border px-4 text-sm shadow-xs after:hidden data-[state=active]:shadow-sm",
      )}
    >
      <Icon className="size-4 text-(--tone-fg)" /> {children}
    </TabsTrigger>
  );
}

/** Dark bar tucked under the preview window: what this view is for, and where it leads. */
function Caption({ icon, tone, title, body, href, cta }: { icon: LucideIcon; tone: Tone; title: string; body: string; href: string; cta: string }) {
  return (
    <div className="bg-foreground text-background relative z-10 mx-4 -mt-6 flex flex-col gap-4 rounded-xl p-4 sm:mx-6 sm:flex-row sm:items-center">
      <ToneIcon icon={icon} tone={tone} />
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-white/65">{body}</p>
      </div>
      <Button className="border-background bg-background text-foreground hover:bg-foreground hover:text-background" asChild>
        <Link href={href}>{cta}</Link>
      </Button>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-6">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

function ProjectRows({ items, wards, lang, loading }: { items: Project[]; wards: Ward[] | undefined; lang: string; loading: boolean }) {
  const { t } = useTranslation();
  if (loading) return <RowSkeleton />;
  return (
    <ul className="divide-y">
      {items.map((p) => {
        const w = wards?.find((x) => x.id === p.wardId);
        const done = percent(p.spent, p.budget);
        const visual = CATEGORY_VISUAL[p.category] ?? CATEGORY_VISUAL.OTHER;
        return (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className={ROW}>
              <ToneIcon icon={visual.icon} tone={visual.tone} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{p.title ?? `#${p.id}`}</span>
                <span className="text-muted-foreground truncate text-sm">
                  {t(`categories.${p.category}`)}
                  {w && `, ${wardName(w, lang)}`}
                </span>
              </span>
              <span className="hidden flex-col gap-1.5 sm:flex">
                <span className="bg-muted h-2 overflow-hidden rounded-full" role="img" aria-label={`${Math.round(done)}%`}>
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, done))}%`, backgroundColor: STATUS_COLOR[p.status] ?? "#6b7280" }} />
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  <Amount value={p.spent} compact /> / <Amount value={p.budget} compact />
                </span>
              </span>
              <StatusBadge status={p.status} className="justify-self-end" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ComplaintRows({ items, titles, loading }: { items: Grievance[]; titles: Map<number, string>; loading: boolean }) {
  const { t } = useTranslation();
  if (loading) return <RowSkeleton />;
  return (
    <ul className="divide-y">
      {items.map((g) => {
        const visual = GRIEVANCE_VISUAL[g.category] ?? GRIEVANCE_VISUAL.OTHER;
        return (
          <li key={g.id}>
            <Link href={`/projects/${g.projectId}`} className={ROW}>
              <ToneIcon icon={visual.icon} tone={visual.tone} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{t(`grievanceCategories.${g.category}`, { defaultValue: g.category })}</span>
                <span className="text-muted-foreground truncate text-sm">{titles.get(g.projectId) ?? `#${g.projectId}`}</span>
              </span>
              <span className="text-muted-foreground hidden items-center gap-1.5 text-sm tabular-nums sm:flex">
                <ThumbsUp className="size-4" aria-hidden="true" />
                {t("home.complaintBacked", { n: g.upvotes })}
              </span>
              <StatusBadge status={g.status} className="justify-self-end" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** One cell of the totals strip: a toned icon, the label, then the number. */
function Stat({ icon, tone, label, loading, children }: { icon: LucideIcon; tone: Tone; label: string; loading: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-6 border-r border-b p-5 sm:p-8 [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+4)]:border-b-0">
      <div className="flex items-center gap-3">
        <ToneIcon icon={icon} tone={tone} size="sm" />
        <p className="text-muted-foreground text-sm leading-tight">{label}</p>
      </div>
      {loading ? <Skeleton className="h-11 w-28" /> : <p className="text-4xl font-medium tracking-[-0.04em] tabular-nums sm:text-5xl">{children}</p>}
    </div>
  );
}

function FloatingTile({ icon, tone, className }: { icon: LucideIcon; tone: Tone; className: string }) {
  return (
    <span aria-hidden="true" className={cn("bg-background absolute hidden rounded-2xl border p-1.5 shadow-sm md:block", className)}>
      <ToneIcon icon={icon} tone={tone} size="lg" />
    </span>
  );
}
