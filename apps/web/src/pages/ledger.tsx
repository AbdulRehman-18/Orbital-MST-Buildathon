import { getListLedgerEventsQueryKey, listLedgerEvents } from "@namma-seva/api-client";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingRows, PageHeader } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/api";
import { EventsTable } from "./project-detail";

const CONTRACTS = ["ProjectRegistry", "MilestoneEscrow", "GrievanceRegistry", "TenderRegistry", "NammaSevaAccess"];
const PAGE = 50;

export default function LedgerPage() {
  const { t } = useTranslation();
  const [contract, setContract] = useState("all");
  const [pending, setPending] = useState(false);
  const [offset, setOffset] = useState(0);
  const params = { contract: contract === "all" ? undefined : contract, includePending: pending, limit: PAGE, offset };
  const q = useApi(getListLedgerEventsQueryKey(params), () => listLedgerEvents(params));
  const total = q.data?.total ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title={t("ledger.title")} subtitle={t("ledger.subtitle")} icon={ScrollText} />
      <div className="flex flex-wrap items-center gap-3">
        <Select value={contract} onValueChange={(v) => (setContract(v), setOffset(0))}>
          <SelectTrigger className="w-56" aria-label={t("ledger.contract")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {CONTRACTS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-primary size-4" checked={pending} onChange={(e) => setPending(e.target.checked)} />
          {t("ledger.includePending")}
        </label>
        <span className="text-muted-foreground ml-auto text-sm tabular-nums">
          {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} {t("common.of")} {total}
        </span>
        <Button size="icon" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} aria-label={t("common.back")}>
          <ChevronLeft />
        </Button>
        <Button size="icon" variant="outline" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} aria-label="Next">
          <ChevronRight />
        </Button>
      </div>
      {q.isLoading ? <LoadingRows rows={6} /> : <EventsTable events={q.data?.items ?? []} />}
    </div>
  );
}
