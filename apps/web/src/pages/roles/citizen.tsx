import { listGrievances, listProjects, listWards } from "@namma-seva/api-client";
import { Building2, Map as MapIcon, Megaphone, ThumbsUp, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, LoadingRows, PageHeader, StatCard } from "@/components/common/bits";
import { FileGrievanceDialog, GrievanceCard } from "@/components/common/grievances";
import { ProjectCard } from "@/components/common/project-card";
import { ProjectMap } from "@/components/common/project-map";
import { RoleGate } from "@/components/common/role-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { wardName } from "@/lib/wards";

export default function CitizenDashboard() {
  return (
    <RoleGate role="CITIZEN">
      <Citizen />
    </RoleGate>
  );
}

function Citizen() {
  const { t, i18n } = useTranslation();
  const { user, displayName } = useAuth();
  const [ward, setWard] = useState("all");
  const wardId = ward === "all" ? undefined : Number(ward);
  const wards = useApi(["/api/wards"], () => listWards());
  const projects = useApi(["/api/projects", "citizen", wardId], () => listProjects({ wardId, limit: 200 }));
  const mine = useApi(["/api/grievances", "mine", user?.id], () => listGrievances({ mine: true, limit: 100 }));
  const allProjects = useApi(["/api/projects", "all"], () => listProjects({ limit: 200 }));
  const titleOf = (id: number) => allProjects.data?.items.find((p) => p.id === id)?.title;

  const items = projects.data?.items ?? [];
  const myGrievances = mine.data ?? [];
  const upvotes = myGrievances.reduce((n, g) => n + g.upvotes, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        icon={UserRound}
        title={t("citizen.title", { name: displayName ?? t("roles.CITIZEN") })}
        subtitle={t("citizen.subtitle")}
        actions={<FileGrievanceDialog projects={allProjects.data?.items ?? []} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("home.statProjects")} value={items.length} icon={Building2} tone="primary" loading={projects.isLoading} />
        <StatCard label={t("citizen.myGrievances")} value={myGrievances.length} icon={Megaphone} tone="warning" loading={mine.isLoading} />
        <StatCard label={t("status.ESCALATED")} value={myGrievances.filter((g) => g.status === "ESCALATED").length} icon={Megaphone} tone="civic" loading={mine.isLoading} />
        <StatCard label={t("citizen.upvotes", { count: upvotes })} value={upvotes} icon={ThumbsUp} tone="success" loading={mine.isLoading} />
      </div>

      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map">
            <MapIcon /> {t("projects.mapView")}
          </TabsTrigger>
          <TabsTrigger value="grievances">
            <Megaphone /> {t("citizen.myGrievances")} ({myGrievances.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">{t("citizen.mapHint")}</p>
            <Select value={ward} onValueChange={setWard}>
              <SelectTrigger className="sm:w-60" aria-label={t("common.ward")}>
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
          </div>
          <ProjectMap projects={items} className="h-[480px]" locate />
          {projects.isLoading ? (
            <LoadingRows />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="grievances" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("citizen.fileTitle")}</CardTitle>
              <CardDescription>{t("citizen.fileBody")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FileGrievanceDialog projects={allProjects.data?.items ?? []} />
            </CardContent>
          </Card>
          {mine.isLoading ? (
            <LoadingRows />
          ) : myGrievances.length === 0 ? (
            <EmptyState icon={Megaphone} title={t("citizen.noGrievances")} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {myGrievances.map((g) => (
                <GrievanceCard key={g.id} g={g} showProject projectTitle={titleOf(g.projectId)} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
