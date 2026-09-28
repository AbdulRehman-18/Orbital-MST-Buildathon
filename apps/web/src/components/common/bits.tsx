// Small shared display components.
import { Check, Copy, ExternalLink, Inbox, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMode } from "@/lib/api";
import { explorerAddress, explorerTx } from "@/lib/chain";
import { formatAmount, shortAddress, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

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
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight md:text-3xl">
          {Icon && <Icon className="text-primary size-7 shrink-0" aria-hidden="true" />}
          {title}
          {badge}
        </h1>
        {subtitle && <p className="text-muted-foreground max-w-3xl text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  loading,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  tone?: "default" | "primary" | "civic" | "warning" | "success";
  loading?: boolean;
}) {
  const toneClass = {
    default: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    civic: "bg-accent text-accent-foreground",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  }[tone];
  return (
    <Card className="gap-0 py-3 sm:py-4">
      <CardContent className="flex items-center gap-3 px-3 sm:gap-4 sm:px-4">
        {Icon && (
          <div className={cn("hidden size-11 shrink-0 items-center justify-center rounded-xl sm:flex", toneClass)}>
            <Icon className="size-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-muted-foreground line-clamp-2 text-[11px] leading-tight font-medium tracking-wide uppercase sm:text-xs">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-20" />
          ) : (
            <p className="text-xl font-semibold break-words tabular-nums sm:text-2xl">{value}</p>
          )}
          {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
        </div>
      </CardContent>
    </Card>
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
  if (!address) return <span className="text-muted-foreground">{t("common.notAssigned")}</span>;
  const url = explorerAddress(address);
  return (
    <span className="inline-flex items-center gap-1">
      {label && <span className="font-medium">{label}</span>}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs underline-offset-4 hover:underline" title={address}>
          {shortAddress(address)}
        </a>
      ) : (
        <span className="font-mono text-xs" title={address}>
          {shortAddress(address)}
        </span>
      )}
      {you && <span className="bg-primary/10 text-primary rounded px-1 text-[10px] font-semibold uppercase">{t("common.you")}</span>}
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
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

export function ProgressBar({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "civic" }) {
  return (
    <div className={cn("bg-muted h-2 w-full overflow-hidden rounded-full", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn("h-full rounded-full transition-all", tone === "primary" ? "bg-primary" : "bg-civic")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
