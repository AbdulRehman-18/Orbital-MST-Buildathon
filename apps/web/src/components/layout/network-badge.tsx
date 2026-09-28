import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { network } from "@/lib/chain";

/** Static for now; Phase 4 turns this into the live NetworkStatusBar (head block, indexer lag). */
export function NetworkBadge() {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1.5 font-mono">
          <span className="bg-civic size-2 rounded-full" aria-hidden="true" />
          {network.name}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {t("common.network")}: {network.name} · chain ID {network.id}
      </TooltipContent>
    </Tooltip>
  );
}
