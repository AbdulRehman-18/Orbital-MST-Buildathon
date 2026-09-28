import { getProjectStats, getGetProjectStatsQueryKey, listProjects, listWards } from "@namma-seva/api-client";
import { ArrowRight, Building2, Camera, FlaskConical, IndianRupee, Link2, Megaphone, Search, Wallet } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Amount, StatCard } from "@/components/common/bits";
import { ProjectMap } from "@/components/common/project-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi, useDemo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { wardName } from "@/lib/wards";

const STEPS = [
  { icon: Link2, title: "home.step1Title", body: "home.step1Body" },
  { icon: Camera, title: "home.step2Title", body: "home.step2Body" },
  { icon: Megaphone, title: "home.step3Title", body: "home.step3Body" },
] as const;

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const demo = useDemo();
  const { status } = useAuth();
  const [ward, setWard] = useState<string>("all");
  const wardId = ward === "all" ? undefined : Number(ward);

  const stats = useApi(getGetProjectStatsQueryKey({ wardId }), () => getProjectStats({ wardId }));
  const projects = useApi(["/api/projects", "map", wardId], () => listProjects({ wardId, limit: 200 }));
  const wards = useApi(["/api/wards"], () => listWards());

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <section className="flex flex-col gap-6 pt-2 md:pt-6">
        <Badge variant="secondary" className="w-fit">
          {t("brand.tagline")}
        </Badge>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance md:text-5xl">{t("home.heroTitle")}</h1>
        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">{t("home.heroBody")}</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/projects">
              {t("home.ctaExplore")} <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/verify">
              <Search /> {t("home.ctaVerify")}
            </Link>
          </Button>
          {demo.data?.enabled && status !== "signed-in" && (
            <Button size="lg" variant="secondary" asChild>
              <Link href="/login">
                <FlaskConical /> {t("home.ctaDemo")}
              </Link>
            </Button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("home.statProjects")} value={stats.data?.totalProjects ?? 0} icon={Building2} tone="primary" loading={stats.isLoading} />
        <StatCard label={t("home.statBudget")} value={<Amount value={stats.data?.totalBudget} compact />} icon={Wallet} tone="civic" loading={stats.isLoading} />
        <StatCard label={t("home.statSpent")} value={<Amount value={stats.data?.totalSpent} compact />} icon={IndianRupee} tone="success" loading={stats.isLoading} />
        <StatCard label={t("home.statGrievances")} value={stats.data?.openGrievances ?? 0} icon={Megaphone} tone="warning" loading={stats.isLoading} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t("home.mapTitle")}</h2>
            <p className="text-muted-foreground text-sm">{t("home.mapBody")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={ward} onValueChange={setWard}>
              <SelectTrigger className="w-56" aria-label={t("home.wardFilter")}>
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
            {wardId !== undefined && (
              <Button variant="outline" asChild>
                <Link href={`/ward/${wardId}`}>{t("common.view")}</Link>
              </Button>
            )}
          </div>
        </div>
        <ProjectMap projects={projects.data?.items ?? []} className="h-[460px]" locate />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t("home.stepsTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <div className="bg-accent text-accent-foreground mb-2 flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{t(title)}</CardTitle>
                <CardDescription>{t(body)}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
