import { listProjects, listTenders, type Tender } from "@namma-seva/api-client";
import { Gavel, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { AddressLink, Amount, EmptyState, LoadingRows, PageHeader } from "@/components/common/bits";
import { IpfsText } from "@/components/common/chain-content";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const PHASE_KEY: Record<Tender["phase"], string> = {
  COMMIT: "tenders.commitPhase",
  REVEAL: "tenders.revealPhase",
  AWAITING_AWARD: "tenders.awaitingAward",
  CLOSED: "tenders.closed",
};

export function TenderCard({
  tender,
  projectTitle,
  footer,
}: {
  tender: Tender;
  projectTitle?: string | null;
  footer?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
            <Lock className="size-3" /> {t(PHASE_KEY[tender.phase])}
          </span>
          <span className="text-muted-foreground ml-auto font-mono text-xs">#{tender.id}</span>
        </div>
        <Link href={`/projects/${tender.projectId}`} className="font-semibold hover:underline">
          {projectTitle ?? `${t("common.project")} #${tender.projectId}`}
        </Link>
        <IpfsText cid={tender.metaCid} field="description" className="text-muted-foreground" />
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>{t("tenders.bids", { count: tender.bidCount })}</span>
          <span>{t("tenders.revealed", { count: tender.revealedCount })}</span>
          <span>
            {t("tenders.commitBy", { when: formatDateTime(tender.commitDeadline, i18n.language) })}
          </span>
          <span>
            {t("tenders.revealBy", { when: formatDateTime(tender.revealDeadline, i18n.language) })}
          </span>
        </div>
        {tender.awardedTo && (
          <p className="text-sm">
            {t("tenders.winner")}: <AddressLink address={tender.awardedTo} /> ·{" "}
            <Amount value={tender.winningBid} />
          </p>
        )}
        {footer && (
          <div className="mt-1 flex flex-wrap items-center gap-2 border-t pt-3">{footer}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TendersPage() {
  const { t } = useTranslation();
  const tenders = useApi(["/api/tenders"], () => listTenders());
  const projects = useApi(["/api/projects", "all"], () => listProjects({ limit: 200 }));
  const title = (id: number) => projects.data?.items.find((p) => p.id === id)?.title;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader title={t("tenders.title")} subtitle={t("tenders.subtitle")} icon={Gavel} />
      {tenders.isLoading ? (
        <LoadingRows />
      ) : (tenders.data ?? []).length === 0 ? (
        <EmptyState title={t("tenders.empty")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {tenders.data!.map((tn) => (
            <TenderCard key={tn.id} tender={tn} projectTitle={title(tn.projectId)} />
          ))}
        </div>
      )}
    </div>
  );
}
