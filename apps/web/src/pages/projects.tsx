import { getListProjectsQueryKey, listProjects, listWards, type ProjectStatus } from "@namma-seva/api-client";
import { Building2, List, Map as MapIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, LoadingRows, PageHeader } from "@/components/common/bits";
import { ProjectCard } from "@/components/common/project-card";
import { ProjectMap } from "@/components/common/project-map";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { wardName } from "@/lib/wards";

const STATUSES: ProjectStatus[] = ["PENDING_APPROVAL", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"];

export default function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const [ward, setWard] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const params = {
    wardId: ward === "all" ? undefined : Number(ward),
    status: status === "all" ? undefined : (status as ProjectStatus),
    limit: 200,
  };
  const projects = useApi(getListProjectsQueryKey(params), () => listProjects(params));
  const wards = useApi(["/api/wards"], () => listWards());

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (projects.data?.items ?? []).filter(
      (p) => !needle || (p.title ?? "").toLowerCase().includes(needle) || String(p.id) === needle,
    );
  }, [projects.data, q]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={t("projects.title")} subtitle={t("projects.subtitle")} icon={Building2} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("projects.searchPlaceholder")} className="sm:max-w-xs" />
        <Select value={ward} onValueChange={setWard}>
          <SelectTrigger className="sm:w-56" aria-label={t("common.ward")}>
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48" aria-label={t("common.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">
            <List /> {t("projects.listView")}
          </TabsTrigger>
          <TabsTrigger value="map">
            <MapIcon /> {t("projects.mapView")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="mt-4">
          {projects.isLoading ? (
            <LoadingRows rows={4} />
          ) : items.length === 0 ? (
            <EmptyState title={t("projects.empty")} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="map" className="mt-4">
          <ProjectMap projects={items} className="h-[560px]" locate />
        </TabsContent>
      </Tabs>
    </div>
  );
}
