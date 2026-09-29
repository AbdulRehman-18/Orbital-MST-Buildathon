// Small shared display components.
import { Check, Copy, ExternalLink, Inbox, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMode } from "@/lib/api";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { formatAmount, shortAddress, shortHash } from "@/lib/format";
import { useNameOf } from "@/lib/names";
import { cn } from "@/lib/utils";
import { ToneIcon, type Tone } from "./tone";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  badge,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-medium tracking-[-0.03em] md:text-4xl">
          {Icon && <Icon className="text-brand size-7 shrink-0" aria-hidden="true" />}
          {title}
          {badge}
        </h1>
        {subtitle && <p className="text-muted-foreground max-w-3xl text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * One cell of a stat strip: a label over a large number. Place several inside a
 * `grid grid-cols-2 lg:grid-cols-4` container; cells draw their own hairline dividers, so no gaps are needed.
 */
const STAT_TONE: Record<string, Tone> = { default: "slate", primary: "blue", civic: "teal", warning: "amber", success: "green" };

export function StatCard({
  label,
  value,
  hint,
  loading,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
  /** Optional icon, shown in a soft tile tinted by `tone`. */
  icon?: LucideIcon;
  tone?: "default" | "primary" | "civic" | "warning" | "success";
}) {
  return (
    <div className="border-border flex min-w-0 flex-col gap-6 border-r border-b p-5 last:border-r-0 sm:p-7 [&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+4)]:border-b-0">
      <div className="flex items-center gap-3">
        {icon && <ToneIcon icon={icon} tone={STAT_TONE[tone]} size="sm" />}
        <p className="text-muted-foreground text-sm leading-tight">{label}</p>
      </div>
      <div className="flex flex-col gap-1">
        {loading ? <Skeleton className="h-10 w-24" /> : <p className="text-3xl font-medium tracking-[-0.03em] break-words tabular-nums sm:text-4xl">{value}</p>}
        {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
      </div>
    </div>
  );
}

export function Amount({ value, compact, className }: { value: string | bigint | null | undefined; compact?: boolean; className?: string }) {
  const mode = useMode();
  return <span className={cn("tabular-nums", className)}>{formatAmount(value, mode, { compact })}</span>;
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded"
      aria-label={t("common.copy")}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function AddressLink({ address, label, you }: { address: string | null | undefined; label?: string; you?: boolean }) {
  const { t } = useTranslation();
  const nameOf = useNameOf();
  if (!address) return <span className="text-muted-foreground">{t("common.notAssigned")}</span>;
  const url = explorerAddress(address);
  const named = nameOf(address);
  const short = url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs underline-offset-4 hover:underline" title={address}>
      {shortAddress(address)}
    </a>
  ) : (
    <span className="font-mono text-xs" title={address}>
      {shortAddress(address)}
    </span>
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {label && <span className="font-medium">{label}</span>}
      {named ? (
        <>
          <span className="font-medium" title={named.title}>
            {named.name}
          </span>
          <span className="text-muted-foreground">{short}</span>
        </>
      ) : (
        short
      )}
      {you && <span className="bg-accent text-accent-foreground rounded px-1 text-[10px] font-semibold uppercase">{t("common.you")}</span>}
      <CopyButton text={address} />
    </span>
  );
}

export function TxLink({ hash }: { hash: string | null | undefined }) {
  if (!hash) return <span className="text-muted-foreground">—</span>;
  const url = explorerTx(hash);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline" title={hash}>
          {shortHash(hash)} <ExternalLink className="size-3" />
        </a>
      ) : (
        <span title={hash}>{shortHash(hash)}</span>
      )}
      <CopyButton text={hash} />
    </span>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center">
      <Icon className="text-muted-foreground size-8" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      {body && <p className="text-muted-foreground max-w-sm text-sm">{body}</p>}
      {action}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function ProgressBar({ value, className, tone = "primary", label }: { value: number; className?: string; tone?: "primary" | "civic"; label?: string }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn("bg-muted h-2 w-full overflow-hidden rounded-full", className)}
      role="progressbar"
      aria-label={label ?? t("common.progress")}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all", tone === "primary" ? "bg-brand" : "bg-civic")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
