import { useTranslation } from "react-i18next";
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
        <span className="text-muted-foreground hidden h-8 items-center gap-2 border px-2.5 font-mono text-[11px] xl:inline-flex">
          <span
            className={cn(
              "size-1.5 rounded-full",
              healthy ? "bg-foreground" : status.isError ? "bg-destructive" : "border-foreground border bg-transparent",
              live.connected && "animate-pulse",
            )}
            aria-hidden="true"
          />
          <span>{network.name}</span>
          {head !== null && <span className="text-foreground tabular-nums">#{head}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5 font-mono text-xs">
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
