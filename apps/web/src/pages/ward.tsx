import { getProjectStats, listGrievances, listProjects, listWards } from "@namma-seva/api-client";
import { Building2, Download, IndianRupee, MapPinned, Megaphone, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "wouter";
import { Amount, EmptyState, PageHeader, StatCard } from "@/components/common/bits";
import { GrievanceCard } from "@/components/common/grievances";
import { ProjectCard } from "@/components/common/project-card";
import { ProjectMap } from "@/components/common/project-map";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api";
import { wardName } from "@/lib/wards";

export default function WardPage() {
  const { id } = useParams<{ id: string }>();
  const wardId = Number(id);
  const { t, i18n } = useTranslation();
  const wards = useApi(["/api/wards"], () => listWards());
  const stats = useApi(["/api/projects/stats", { wardId }], () => getProjectStats({ wardId }));
  const projects = useApi(["/api/projects", { wardId }], () => listProjects({ wardId, limit: 200 }));
  const ids = new Set((projects.data?.items ?? []).map((p) => p.id));
  const grievances = useApi(["/api/grievances", "all"], () => listGrievances({ limit: 200 }));
  const ward = wards.data?.find((w) => w.id === wardId);
  const items = projects.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        icon={MapPinned}
        title={t("ward.title", { id: wardId, name: ward ? wardName(ward, i18n.language) : "…" })}
        subtitle={t("ward.subtitle")}
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/public/export.csv?wardId=${wardId}`} download>
              <Download /> {t("ward.csv")}
            </a>
          </Button>
        }
      />
      <div className="bg-card grid grid-cols-2 overflow-hidden rounded-3xl border lg:grid-cols-4">
        <StatCard label={t("home.statProjects")} value={stats.data?.totalProjects ?? 0} icon={Building2} tone="primary" loading={stats.isLoading} />
        <StatCard label={t("home.statBudget")} value={<Amount value={stats.data?.totalBudget} compact />} icon={Wallet} tone="civic" loading={stats.isLoading} />
        <StatCard label={t("home.statSpent")} value={<Amount value={stats.data?.totalSpent} compact />} icon={IndianRupee} tone="success" loading={stats.isLoading} />
        <StatCard label={t("home.statGrievances")} value={stats.data?.openGrievances ?? 0} icon={Megaphone} tone="warning" loading={stats.isLoading} />
      </div>
      <ProjectMap projects={items} className="h-80" />
      {items.length === 0 ? (
        <EmptyState title={t("projects.empty")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
      {(grievances.data ?? []).filter((g) => ids.has(g.projectId)).length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("common.grievances")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {grievances.data!
              .filter((g) => ids.has(g.projectId))
              .map((g) => (
                <GrievanceCard key={g.id} g={g} showProject projectTitle={items.find((p) => p.id === g.projectId)?.title} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
