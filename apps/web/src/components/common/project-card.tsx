import { listWards, type Project } from "@namma-seva/api-client";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatDate, percent } from "@/lib/format";
import { useNameOf } from "@/lib/names";
import { wardName } from "@/lib/wards";
import { Amount } from "./bits";
import { STATUS_COLOR, StatusBadge } from "./status-badge";
import { CATEGORY_VISUAL, ToneIcon } from "./tone";

/** A project in plain terms: what, where, who is building it, by when, and how much has been paid. */
export function ProjectCard({ p, footer }: { p: Project; footer?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const wards = useApi(["/api/wards"], () => listWards());
  const nameOf = useNameOf();
  const ward = wards.data?.find((w) => w.id === p.wardId);
  const visual = CATEGORY_VISUAL[p.category] ?? CATEGORY_VISUAL.OTHER;
  const pct = percent(p.spent, p.budget);
  const contractor = p.contractorAddr ? (nameOf(p.contractorAddr)?.name ?? t("common.contractor")) : t("common.notAssigned");

  return (
    <Card className="hover:border-foreground/25 gap-0 overflow-hidden py-0 transition-colors">
      <Link href={`/projects/${p.id}`} className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex items-start gap-3">
          <ToneIcon icon={visual.icon} tone={visual.tone} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="line-clamp-2 leading-snug font-medium">{p.title ?? `${t("common.project")} #${p.id}`}</p>
            <p className="text-muted-foreground truncate text-sm">
              {t(`categories.${p.category}`)}, {ward ? wardName(ward, i18n.language) : `${t("common.ward")} ${p.wardId}`}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t("citizen.builtBy")}</dt>
          <dd className="truncate font-medium">{contractor}</dd>
          <dt className="text-muted-foreground">{t("citizen.due")}</dt>
          <dd>{formatDate(p.endDate, i18n.language)}</dd>
        </dl>

        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-end justify-between gap-2">
            <p className="text-sm">
              <Amount value={p.spent} compact className="font-medium" />{" "}
              <span className="text-muted-foreground">
                <PaidOf budget={p.budget} />
              </span>
            </p>
            <StatusBadge status={p.status} />
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar" aria-label={t("common.progress")} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: STATUS_COLOR[p.status] ?? "#6b7280" }} />
          </div>
        </div>
      </Link>
      {footer && <div className="bg-muted/40 border-t px-5 py-3">{footer}</div>}
    </Card>
  );
}

export function PaidOf({ budget }: { budget: string }) {
  const { t } = useTranslation();
  // The budget is a formatted amount, so render the sentence around it rather than interpolating JSX.
  const [before, after] = t("citizen.paidOfBudget", { budget: "\u0000" }).split("\u0000");
  return (
    <>
      {before}
      <Amount value={budget} compact />
      {after}
    </>
  );
}
