import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Hex colours shared by badges and map markers (map markers can't use CSS variables). */
export const STATUS_COLOR: Record<string, string> = {
  PENDING_APPROVAL: "#d97706",
  ACTIVE: "#0d9488",
  PAUSED: "#dc2626",
  COMPLETED: "#16a34a",
  CANCELLED: "#6b7280",
  PENDING: "#6b7280",
  PROOF_SUBMITTED: "#2563eb",
  APPROVED: "#0d9488",
  REJECTED: "#dc2626",
  PAID: "#16a34a",
  VOID: "#6b7280",
  OPEN: "#d97706",
  ESCALATED: "#dc2626",
  RESPONDED: "#16a34a",
  AWARDED: "#16a34a",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  const color = STATUS_COLOR[status] ?? "#6b7280";
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      style={{ borderColor: `${color}55`, backgroundColor: `${color}14`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  );
}

export function PendingBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <span className="size-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
      {t("status.pendingTx")}
    </span>
  );
}
