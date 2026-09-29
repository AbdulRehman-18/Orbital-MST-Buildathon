import {
  listGrievances,
  listProjects,
  listWards,
  type Grievance,
  type Project,
} from "@namma-seva/api-client";
import {
  BadgeCheck,
  Building2,
  Camera,
  LayoutDashboard,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Amount, LoadingRows, StatCard } from "@/components/common/bits";
import { DataRightsCard } from "@/components/common/data-rights";
import { FileGrievanceDialog, GrievanceCard } from "@/components/common/grievances";
import { PaidOf, ProjectCard } from "@/components/common/project-card";
import { ProjectMap } from "@/components/common/project-map";
import { RoleGate } from "@/components/common/role-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { CATEGORY_VISUAL, GRIEVANCE_VISUAL, ToneIcon, type Tone } from "@/components/common/tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import { Panel, RolePanel, ViewAll, usePanelTab } from "@/components/layout/role-panel";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useNameOf } from "@/lib/names";
import { cn } from "@/lib/utils";
import { wardName } from "@/lib/wards";

const TABS = ["overview", "projects", "reports", "data"] as const;

export default function CitizenDashboard() {
  return (
    <RoleGate role="CITIZEN">
      <Citizen />
    </RoleGate>
  );
}

function Citizen() {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();
  const [tab, go] = usePanelTab("/citizen", TABS);

  const projects = useApi(["/api/projects", "all"], () => listProjects({ limit: 200 }));
  const mine = useApi(["/api/grievances", "mine", user?.id], () =>
    listGrievances({ mine: true, limit: 100 }),
  );
  const items = projects.data?.items ?? [];
  const reports = mine.data ?? [];
  const openReports = reports.filter((g) => g.status !== "RESPONDED");
  const name = displayName ?? t("roles.CITIZEN");

  return (
    <RolePanel
      tab={tab}
      onTab={go}
      badge={
        <span
          className="tone tone-teal flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-medium"
          aria-hidden="true"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      }
      title={t("citizen.title", { name })}
      subtitle={t("citizen.subtitle")}
      action={<FileGrievanceDialog projects={items} />}
      tabs={[
        {
          value: "overview",
          label: t("citizen.tabOverview"),
          icon: LayoutDashboard,
          tone: "slate",
        },
        {
          value: "projects",
          label: t("home.tabProjects"),
          icon: Building2,
          tone: "blue",
          count: items.length,
        },
        {
          value: "reports",
          label: t("citizen.myGrievances"),
          icon: MessageSquareWarning,
          tone: "amber",
          count: reports.length,
        },
        { value: "data", label: t("dataRights.title"), icon: ShieldCheck, tone: "teal" },
      ]}
    >
      <TabsContent value="overview" className="flex flex-col gap-6">
        <Overview
          items={items}
          reports={reports}
          openReports={openReports}
          loading={projects.isLoading || mine.isLoading}
          onTab={go}
        />
      </TabsContent>
      <TabsContent value="projects">
        <ProjectsTab items={items} loading={projects.isLoading} />
      </TabsContent>
      <TabsContent value="reports">
        <ReportsTab reports={reports} items={items} loading={mine.isLoading} />
      </TabsContent>
      <TabsContent value="data">
        <DataRightsCard />
      </TabsContent>
    </RolePanel>
  );
}

/** At a glance: the money, what is waiting on you, and what finishes next. */
function Overview({
  items,
  reports,
  openReports,
  loading,
  onTab,
}: {
  items: Project[];
  reports: Grievance[];
  openReports: Grievance[];
  loading: boolean;
  onTab: (tab: string) => void;
}) {
  const { t } = useTranslation();
  const paid = items.reduce((n, p) => n + BigInt(p.spent), 0n);
  const budget = items.reduce((n, p) => n + BigInt(p.budget), 0n);
  const dueSoon = items
    .filter((p) => p.status === "ACTIVE" || p.status === "PENDING_APPROVAL")
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .slice(0, 4);
  const titleOf = (id: number) => items.find((p) => p.id === id)?.title ?? `#${id}`;

  return (
    <>
      <section
        aria-label={t("home.statsLabel")}
        className="grid grid-cols-2 overflow-hidden rounded-2xl border lg:grid-cols-4"
      >
        <StatCard
          label={t("home.statProjects")}
          value={items.length}
          icon={Building2}
          tone="primary"
          loading={loading}
        />
        <StatCard
          label={t("citizen.statPaid")}
          value={<Amount value={paid.toString()} compact />}
          hint={<PaidOf budget={budget.toString()} />}
          icon={BadgeCheck}
          tone="success"
          loading={loading}
        />
        <StatCard
          label={t("citizen.statOpen")}
          value={openReports.length}
          icon={MessageSquareWarning}
          tone="warning"
          loading={loading}
        />
        <StatCard
          label={t("citizen.statBacking")}
          value={reports.reduce((n, g) => n + g.upvotes, 0)}
          icon={ThumbsUp}
          tone="civic"
          loading={loading}
        />
      </section>

      <ProjectMap projects={items} className="mono-map h-[420px] rounded-2xl" locate />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={t("citizen.attentionTitle")}
          action={reports.length > 0 && <ViewAll onClick={() => onTab("reports")} />}
        >
          {loading ? (
            <LoadingRows rows={2} />
          ) : openReports.length === 0 ? (
            <p className="text-muted-foreground px-5 py-10 text-center text-sm">
              {t("citizen.attentionEmpty")}
            </p>
          ) : (
            <ul className="divide-y">
              {openReports.slice(0, 4).map((g) => {
                const v = GRIEVANCE_VISUAL[g.category] ?? GRIEVANCE_VISUAL.OTHER;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => onTab("reports")}
                      className="hover:bg-muted/60 flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors"
                    >
                      <ToneIcon icon={v.icon} tone={v.tone} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {t(`grievanceCategories.${g.category}`)}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {titleOf(g.projectId)}
                        </span>
                      </span>
                      <StatusBadge status={g.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title={t("citizen.dueSoonTitle")}
          action={<ViewAll onClick={() => onTab("projects")} />}
        >
          {loading ? <LoadingRows rows={2} /> : <ProjectRows items={dueSoon} />}
        </Panel>
      </div>

      <div className="bg-foreground text-background flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-8">
        <ToneIcon icon={Camera} tone="amber" size="lg" />
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-lg font-medium">{t("citizen.reportCtaTitle")}</p>
          <p className="text-sm text-white/65">{t("citizen.reportCtaBody")}</p>
        </div>
        <FileGrievanceDialog
          projects={items}
          trigger={(open) => (
            <Button
              className="border-background bg-background text-foreground hover:bg-foreground hover:text-background"
              onClick={open}
            >
              {t("citizen.fileTitle")}
            </Button>
          )}
        />
      </div>
    </>
  );
}

function ProjectRows({ items }: { items: Project[] }) {
  const { t, i18n } = useTranslation();
  const nameOf = useNameOf();
  return (
    <ul className="divide-y">
      {items.map((p) => {
        const v = CATEGORY_VISUAL[p.category] ?? CATEGORY_VISUAL.OTHER;
        const builder = p.contractorAddr ? nameOf(p.contractorAddr)?.name : undefined;
        return (
          <li key={p.id}>
            <Link
              href={`/projects/${p.id}`}
              className="hover:bg-muted/60 flex items-center gap-3 px-5 py-3.5 transition-colors"
            >
              <ToneIcon icon={v.icon} tone={v.tone} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{p.title ?? `#${p.id}`}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {t("citizen.due")} {formatDate(p.endDate, i18n.language)}
                  {builder && `, ${builder}`}
                </span>
              </span>
              <StatusBadge status={p.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Every project, filterable by name, ward and status. */
function ProjectsTab({ items, loading }: { items: Project[]; loading: boolean }) {
  const { t, i18n } = useTranslation();
  const wards = useApi(["/api/wards"], () => listWards());
  const [ward, setWard] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const statuses = [...new Set(items.map((p) => p.status))];
  const shown = items.filter(
    (p) =>
      (ward === "all" || p.wardId === Number(ward)) &&
      (status === "all" || p.status === status) &&
      (!q || (p.title ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("citizen.searchProjects")}
            aria-label={t("citizen.searchProjects")}
            className="pl-9"
          />
        </div>
        <Select value={ward} onValueChange={setWard}>
          <SelectTrigger className="lg:w-60" aria-label={t("common.ward")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allWards")}</SelectItem>
            {wards.data?.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                {w.id} · {wardName(w, i18n.language)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div
          className="flex flex-wrap gap-2 lg:ml-auto"
          role="group"
          aria-label={t("common.status")}
        >
          {["all", ...statuses].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "h-8 rounded-full border px-3 text-sm transition-colors",
                status === s
                  ? "bg-foreground text-background border-foreground"
                  : "text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              {s === "all" ? t("common.all") : t(`status.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingRows />
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed px-6 py-14 text-center text-sm">
          {t("citizen.noMatch")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              footer={
                p.status !== "CANCELLED" && (
                  <FileGrievanceDialog
                    projects={items}
                    defaultProjectId={p.id}
                    trigger={(open) => (
                      <Button size="sm" variant="ghost" className="-ml-2" onClick={open}>
                        <MessageSquareWarning className="tone-amber text-(--tone-fg)" />{" "}
                        {t("citizen.fileTitle")}
                      </Button>
                    )}
                  />
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsTab({
  reports,
  items,
  loading,
}: {
  reports: Grievance[];
  items: Project[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (loading) return <LoadingRows />;
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed px-6 py-14 text-center">
        <ToneIcon icon={MessageSquareWarning} tone="amber" size="lg" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("citizen.noGrievances")}</p>
          <p className="text-muted-foreground max-w-sm text-sm">{t("citizen.fileBody")}</p>
        </div>
        <FileGrievanceDialog projects={items} />
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {reports.map((g) => (
        <GrievanceCard
          key={g.id}
          g={g}
          showProject
          projectTitle={items.find((p) => p.id === g.projectId)?.title}
        />
      ))}
    </div>
  );
}
