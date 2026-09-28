import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChainStatus } from "@/lib/api";
import { network } from "@/lib/chain";
import { useLiveUpdates } from "@/lib/live";
import { cn } from "@/lib/utils";

/** NetworkStatusBar (plan §11): MST network, head block, indexer lag, live-socket state. */
export function NetworkBadge() {
  const { t } = useTranslation();
  const status = useChainStatus();
  const live = useLiveUpdates();
  const head = live.head?.head ?? status.data?.headBlock ?? null;
  const indexed = live.head?.indexed ?? status.data?.indexedBlock ?? null;
  const lag = head !== null && indexed !== null ? Math.max(head - indexed, 0) : null;
  const confirmations = status.data?.confirmations ?? 6;
  const healthy = status.isSuccess && lag !== null && lag <= confirmations + 3;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1.5 font-mono">
          <span
            className={cn("size-2 rounded-full", healthy ? "bg-emerald-500" : status.isError ? "bg-red-500" : "bg-amber-500", live.connected && "animate-pulse")}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">{network.name}</span>
          {head !== null && <span className="text-muted-foreground">#{head}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5 text-xs">
        <span>
          {t("common.network")}: {network.name} · chain {network.id}
        </span>
        {head !== null && (
          <span>
            {t("network.head")} {head} · {t("network.indexed")} {indexed}
          </span>
        )}
        {lag !== null && <span>{lag <= confirmations ? t("network.synced") : t("network.lag", { n: lag })}</span>}
        <span>{live.connected ? t("common.live") : t("common.offline")}</span>
      </TooltipContent>
    </Tooltip>
  );
}
