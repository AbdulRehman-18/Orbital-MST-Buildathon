import { getTransparency, type Transparency } from "@namma-seva/api-client";
import { Ban, FileCheck2, Lock, Radio, ShieldAlert, ShieldCheck, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AddressLink, EmptyState, PageHeader, StatCard } from "@/components/common/bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/api";
import { formatDate } from "@/lib/format";

function Section({ icon: Icon, title, description, children }: { icon: typeof Lock; title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-lg">
          <Icon className="text-brand size-5" aria-hidden="true" /> {title}
        </CardTitle>
        {description && <CardDescription className="text-base">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AdminCustody({ g }: { g: Transparency["governance"] }) {
  const { t } = useTranslation();
  const holder = g.adminHolder ? <AddressLink address={g.adminHolder} /> : null;

  if (g.adminKind === "MULTISIG_TIMELOCK" && g.multisig) {
    return (
      <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{t("transparency.admin")}</dt>
          <dd className="flex flex-col gap-1">
            <span className="font-medium">{t("transparency.adminMultisig", { n: g.multisig.threshold, m: g.multisig.owners.length })}</span>
            {holder}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{t("transparency.delay")}</dt>
          <dd className="font-medium">{t("transparency.delayValue", { hours: Math.round((g.timelockDelaySeconds ?? 0) / 3600) })}</dd>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <dt className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{t("transparency.owners")}</dt>
          <dd className="flex flex-col gap-1.5">
            {g.multisig.owners.map((o) => (
              <AddressLink key={o} address={o} />
            ))}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{t("transparency.admin")}</p>
      {g.adminKind === "EOA" ? (
        <Alert className="border-warning/50">
          <ShieldAlert />
          <AlertTitle>{t("transparency.adminSingle")}</AlertTitle>
          <AlertDescription>{holder}</AlertDescription>
        </Alert>
      ) : (
        <p className="font-medium">{t("transparency.adminUnknown")}</p>
      )}
    </div>
  );
}

export default function TransparencyPage() {
  const { t } = useTranslation();
  const report = useApi(["/api/transparency"], () => getTransparency(), { refetchInterval: 30_000 });
  const r = report.data;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <PageHeader
        icon={ShieldCheck}
        title={t("transparency.title")}
        subtitle={t("transparency.subtitle")}
        badge={r?.disclosure.pilot ? <Badge variant="secondary">{t("transparency.pilotBody", { network: r.network.name })}</Badge> : undefined}
      />

      {report.isError && <EmptyState icon={Ban} title={t("common.error")} action={undefined} />}

      <section aria-label={t("transparency.statusTitle")} className="bg-card grid grid-cols-2 overflow-hidden rounded-3xl border lg:grid-cols-4">
        <StatCard label={t("transparency.network")} value={<span className="text-2xl sm:text-3xl">{r?.network.name ?? "—"}</span>} hint={r ? `${t("transparency.consensus")}: ${r.network.consensus}` : undefined} loading={report.isLoading} />
        <StatCard label={t("transparency.chainId")} value={r?.network.chainId ?? "—"} loading={report.isLoading} />
        <StatCard label={t("transparency.head")} value={r?.status.headBlock?.toLocaleString("en-IN") ?? "—"} loading={report.isLoading} />
        <StatCard label={t("transparency.indexed")} value={r?.status.indexedBlock?.toLocaleString("en-IN") ?? "—"} hint={r?.status.lagBlocks != null ? `−${r.status.lagBlocks}` : undefined} loading={report.isLoading} />
      </section>

      <Section icon={FileCheck2} title={t("transparency.contractsTitle")} description={t("transparency.contractsBody")}>
        {report.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : r && r.contracts.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
              {r.deployment && (
                <>
                  <span>
                    {t("common.block")} #{r.deployment.blockNumber}
                  </span>
                  <span>commit {r.deployment.commit.slice(0, 8)}</span>
                  <span>{formatDate(r.deployment.deployedAt)}</span>
                </>
              )}
              {r.mode && <span>{r.mode === "LEDGER" ? t("transparency.modeLedger") : t("transparency.modeEscrow")}</span>}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("transparency.colContract")}</TableHead>
                  <TableHead>{t("transparency.colAddress")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("transparency.colImpl")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.contracts.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <AddressLink address={c.address} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{c.implementation ? <AddressLink address={c.implementation} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState icon={FileCheck2} title={t("transparency.noDeployment")} />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={Lock} title={t("transparency.governanceTitle")} description={t("transparency.governanceBody")}>
          {r ? (
            <div className="flex flex-col gap-4">
              <AdminCustody g={r.governance} />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{t("transparency.pause")}</span>
                <Badge variant={r.governance.paused ? "destructive" : "secondary"}>{r.governance.paused ? t("transparency.pausedYes") : t("transparency.pausedNo")}</Badge>
              </div>
              {r.governance.pausers.length > 0 && (
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">{t("transparency.pausers")}</span>
                  {r.governance.pausers.map((a) => (
                    <AddressLink key={a} address={a} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </Section>

        <Section icon={Radio} title={t("transparency.trustTitle")}>
          <p className="text-muted-foreground leading-relaxed text-pretty">{t("transparency.trustBody")}</p>
        </Section>

        <Section icon={UserRoundCheck} title={t("transparency.privacyTitle")}>
          <p className="text-muted-foreground leading-relaxed text-pretty">{t("transparency.privacyBody")}</p>
        </Section>

        <Section icon={ShieldCheck} title={t("transparency.auditTitle")}>
          <div className="text-muted-foreground flex flex-col gap-3 leading-relaxed">
            {r?.disclosure.auditReportUrl ? (
              <a className="text-brand w-fit font-medium underline underline-offset-4" href={r.disclosure.auditReportUrl} target="_blank" rel="noreferrer">
                {t("transparency.auditDone")}
              </a>
            ) : (
              <p>{t("transparency.auditPending")}</p>
            )}
            <p>{t("transparency.staticAnalysis")}</p>
          </div>
        </Section>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("transparency.contactTitle")}</CardTitle>
          <CardDescription>{t("transparency.contactBody")}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {r?.disclosure.grievanceOfficer ? (
            <p>
              <span className="font-semibold">{t("transparency.officer")}:</span> {r.disclosure.grievanceOfficer.name} ·{" "}
              <a className="text-brand underline underline-offset-4" href={`mailto:${r.disclosure.grievanceOfficer.email}`}>
                {r.disclosure.grievanceOfficer.email}
              </a>
            </p>
          ) : (
            <p className="text-muted-foreground">{t("transparency.adminUnknown")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
