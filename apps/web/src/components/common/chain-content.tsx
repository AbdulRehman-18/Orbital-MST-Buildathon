// Content that lives on IPFS (grievance text, proof photos) and the milestone timeline.
import { getMilestoneProof, type Milestone } from "@namma-seva/api-client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Clock, ImageOff, MapPin, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ipfsUrl } from "@/lib/chain";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Amount, TxLink } from "./bits";
import { StatusBadge } from "./status-badge";

/** Pinned JSON by CID (grievance text, milestone/tender metadata, responses). */
export function useIpfsJson<T = Record<string, unknown>>(cid: string | null | undefined) {
  return useQuery({
    queryKey: ["ipfs", cid],
    enabled: !!cid,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(ipfsUrl(cid!));
      if (!res.ok) throw new Error(`IPFS ${res.status}`);
      return (await res.json()) as T;
    },
  });
}

export function IpfsText({ cid, field = "text", className }: { cid: string | null | undefined; field?: string; className?: string }) {
  const q = useIpfsJson(cid);
  if (!cid) return null;
  if (q.isLoading) return <span className="bg-muted block h-4 w-3/4 animate-pulse rounded" />;
  const body = q.data as Record<string, unknown> | undefined;
  const text = (body?.[field] ?? body?.title) as string | undefined;
  return <p className={cn("text-sm text-pretty", className)}>{text ?? <span className="text-muted-foreground font-mono text-xs">{cid}</span>}</p>;
}

export function ProofGallery({ milestoneId, compact }: { milestoneId: number; compact?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["/api/milestones", milestoneId, "proof"], queryFn: () => getMilestoneProof(milestoneId) });
  const media = q.data ?? [];
  if (q.isLoading) return <div className="bg-muted h-20 w-32 animate-pulse rounded-lg" />;
  if (media.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {media.map((m) => (
          <button
            key={m.cid}
            type="button"
            onClick={() => setOpen(m.cid)}
            className={cn(
              "group relative overflow-hidden rounded-lg border",
              compact ? "h-16 w-24" : "h-24 w-36",
              m.flagged && "ring-2 ring-amber-500",
            )}
          >
            <img src={ipfsUrl(m.cid, { preferGateway: true })} alt={t("projects.photos")} className="size-full object-cover transition group-hover:scale-105" loading="lazy" />
            {m.gpsDistanceM !== null && (
              <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[10px] text-white">
                {Math.round(m.gpsDistanceM)} m
              </span>
            )}
          </button>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{t("projects.photos")}</DialogTitle>
          {open &&
            (() => {
              const m = media.find((x) => x.cid === open)!;
              return (
                <div className="flex flex-col gap-3">
                  <img src={ipfsUrl(m.cid, { preferGateway: true })} alt={t("projects.photos")} className="max-h-[60vh] w-full rounded-lg object-contain" />
                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {m.exifLat !== null && m.exifLng !== null && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" /> {m.exifLat.toFixed(5)}, {m.exifLng.toFixed(5)}
                      </span>
                    )}
                    {m.gpsDistanceM !== null && <span>{t("projects.distance", { m: Math.round(m.gpsDistanceM) })}</span>}
                    {m.exifTime && <span>{new Date(m.exifTime).toLocaleString()}</span>}
                    <span className="font-mono">sha256 {m.sha256.slice(0, 18)}…</span>
                  </div>
                  {m.flagged && (
                    <p className="inline-flex items-center gap-1 text-xs text-amber-600">
                      <TriangleAlert className="size-3.5" /> {t("projects.flagged")}
                    </p>
                  )}
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

const STEP_ICON: Record<string, typeof Circle> = {
  PENDING: Circle,
  PROOF_SUBMITTED: Clock,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  PAID: CheckCircle2,
  VOID: ImageOff,
};

export function MilestoneTimeline({
  milestones,
  threshold,
  actions,
}: {
  milestones: Milestone[];
  threshold: number;
  actions?: (m: Milestone) => React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  if (milestones.length === 0) return <p className="text-muted-foreground text-sm">{t("projects.noMilestones")}</p>;
  return (
    <ol className="relative flex flex-col gap-5 border-l pl-6">
      {milestones.map((m, i) => {
        const Icon = STEP_ICON[m.status] ?? Circle;
        return (
          <li key={m.id} className="relative">
            <span
              className={cn(
                "bg-background absolute top-0.5 -left-[33px] flex size-5 items-center justify-center rounded-full",
                m.status === "PAID" && "text-emerald-600",
                m.status === "REJECTED" && "text-red-600",
                m.status === "PROOF_SUBMITTED" && "text-blue-600",
                m.status === "APPROVED" && "text-teal-600",
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs font-semibold">#{i + 1}</span>
                <span className="font-medium">{m.title ?? `${t("common.milestone")} ${m.id}`}</span>
                <StatusBadge status={m.status} />
                <Amount value={m.amount} className="text-muted-foreground ml-auto text-sm" />
              </div>
              {m.status === "PROOF_SUBMITTED" && (
                <p className="text-muted-foreground text-xs">
                  {t("projects.approvalsOf", { count: m.approvalCount, total: threshold })}
                </p>
              )}
              {m.submittedAt && m.status !== "PENDING" && (
                <p className="text-muted-foreground text-xs">{t("projects.submittedOn", { date: formatDate(m.submittedAt, i18n.language) })}</p>
              )}
              {m.proofCid && <ProofGallery milestoneId={m.id} compact />}
              {m.paidTx && (
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  {t("projects.paidOn", { date: formatDate(m.paidAt, i18n.language) })} · <TxLink hash={m.paidTx} />
                </p>
              )}
              {actions?.(m)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
