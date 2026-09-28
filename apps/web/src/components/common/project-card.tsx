import type { Project } from "@namma-seva/api-client";
import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { percent } from "@/lib/format";
import { Amount, ProgressBar } from "./bits";
import { StatusBadge } from "./status-badge";

export function ProjectCard({ p, footer }: { p: Project; footer?: ReactNode }) {
  const { t } = useTranslation();
  const pct = percent(p.spent, p.budget);
  return (
    <Card className="hover:border-primary/60 gap-0 py-0 transition">
      <Link href={`/projects/${p.id}`} className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={p.status} />
          <span className="text-muted-foreground font-mono text-xs">#{p.id}</span>
        </div>
        <p className="line-clamp-2 leading-snug font-semibold">{p.title ?? `${t("common.project")} #${p.id}`}</p>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <MapPin className="size-3" /> {t("common.ward")} {p.wardId} · {t(`categories.${p.category}`)}
        </p>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <Amount value={p.spent} compact className="font-medium" />
            <span className="text-muted-foreground">
              / <Amount value={p.budget} compact />
            </span>
          </div>
          <ProgressBar value={pct} />
          <p className="text-muted-foreground text-xs">{t("projects.budgetUsed", { pct })}</p>
        </div>
      </Link>
      {footer && <CardContent className="border-t px-4 py-3">{footer}</CardContent>}
    </Card>
  );
}
