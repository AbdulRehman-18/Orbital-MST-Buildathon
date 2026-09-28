import {
  getGetProjectQueryKey,
  getProject,
  listDepartments,
  listGrievances,
  listLedgerEvents,
  type ChainEvent,
} from "@namma-seva/api-client";
import { ApiError } from "@namma-seva/api-client";
import { ArrowLeft, CalendarDays, Landmark, MessageCircle, QrCode, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import { AddressLink, Amount, EmptyState, LoadingRows, ProgressBar, TxLink } from "@/components/common/bits";
import { MilestoneTimeline } from "@/components/common/chain-content";
import { FileGrievanceDialog, GrievanceCard } from "@/components/common/grievances";
import { ProjectMap } from "@/components/common/project-map";
import { PendingBadge, StatusBadge } from "@/components/common/status-badge";
import { VerifyButton } from "@/components/common/verify-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, percent } from "@/lib/format";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const q = useApi(getGetProjectQueryKey(projectId), () => getProject(projectId), { enabled: Number.isInteger(projectId) });
  const grievances = useApi(["/api/grievances", { projectId }], () => listGrievances({ projectId }));
  const departments = useApi(["/api/departments"], () => listDepartments());

  if (q.isLoading) return <LoadingRows rows={5} />;
  if (q.error || !q.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert>
          <AlertDescription>{q.error instanceof ApiError && q.error.status === 404 ? t("projects.notIndexed") : t("common.error")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { project: p, milestones, approvals, pendingEvents } = q.data;
  const pct = percent(p.spent, p.budget);
  const dept = departments.data?.find((d) => d.id === p.deptId)?.name;
  const shareUrl = `${window.location.origin}/projects/${p.id}?src=share`;
  const shareText = `${t("projects.shareText", { title: p.title ?? `#${p.id}`, status: t(`status.${p.status}`) })} ${shareUrl}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Link href="/projects" className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline">
        <ArrowLeft className="size-4" /> {t("nav.projects")}
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            {pendingEvents.length > 0 && <PendingBadge />}
            <span className="text-muted-foreground font-mono text-xs">#{p.id}</span>
            <span className="bg-muted rounded px-1.5 py-0.5 text-xs">{t(`categories.${p.category}`)}</span>
            <Link href={`/ward/${p.wardId}`} className="bg-muted rounded px-1.5 py-0.5 text-xs hover:underline">
              {t("common.ward")} {p.wardId}
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{p.title ?? `${t("common.project")} #${p.id}`}</h1>
          {p.description && <p className="text-muted-foreground max-w-3xl text-pretty">{p.description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <QrCode /> QR
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>{t("projects.qrTitle")}</DialogTitle>
                <DialogDescription>{t("projects.qrBody")}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-6 text-black">
                <QRCodeSVG value={`${window.location.origin}/projects/${p.id}?src=board`} size={220} level="M" />
                <p className="text-center text-sm font-semibold">{p.title}</p>
                <p className="text-xs">
                  {t("brand.name")} · #{p.id}
                </p>
              </div>
              <Button onClick={() => window.print()}>{t("common.download")}</Button>
            </DialogContent>
          </Dialog>
          {user?.role === "CITIZEN" && <FileGrievanceDialog projects={[p]} defaultProjectId={p.id} />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs uppercase">{t("common.budget")}</p>
            <Amount value={p.budget} className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-muted-foreground text-xs uppercase">{t("common.funded")}</p>
            <Amount value={p.funded} className="text-2xl font-semibold" />
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="flex flex-col gap-2 px-4">
            <p className="text-muted-foreground text-xs uppercase">{t("common.spent")}</p>
            <Amount value={p.spent} className="text-2xl font-semibold" />
            <ProgressBar value={pct} />
            <p className="text-muted-foreground text-xs">{t("projects.budgetUsed", { pct })}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">{t("projects.overview")}</TabsTrigger>
          <TabsTrigger value="milestones">
            {t("projects.milestonesTab")} ({milestones.length})
          </TabsTrigger>
          <TabsTrigger value="grievances">
            {t("projects.grievancesTab")} ({q.data.grievanceCount})
          </TabsTrigger>
          <TabsTrigger value="ledger">{t("projects.ledgerTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
            <ProjectMap projects={[p]} selectedId={p.id} className="h-72" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="text-primary size-5" /> {t("verify.verifyOnChain")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">{t("verify.howBody")}</p>
                <VerifyButton projectId={p.id} />
              </CardContent>
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="size-4" /> {t("projects.parties")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Row label={t("common.official")}>
                  <AddressLink address={p.officialAddr} you={user?.walletAddress === p.officialAddr} />
                </Row>
                <Row label={t("common.contractor")}>
                  <AddressLink address={p.contractorAddr} you={!!p.contractorAddr && user?.walletAddress === p.contractorAddr} />
                </Row>
                {dept && <Row label={t("common.department")}>{dept}</Row>}
                <Row label={t("common.approvals")}>{t("projects.approvalsOf", { count: p.approvalCount, total: p.approvalThreshold })}</Row>
                {approvals.map((a) => (
                  <div key={a.auditorAddr} className="flex items-center justify-between gap-2 pl-3 text-xs">
                    <AddressLink address={a.auditorAddr} />
                    <TxLink hash={a.txHash} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4" /> {t("projects.timeline")}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Row label={t("common.start")}>{formatDate(p.startDate, i18n.language)}</Row>
                <Row label={t("common.end")}>{formatDate(p.endDate, i18n.language)}</Row>
                <Row label={t("common.tx")}>
                  <TxLink hash={p.createdTx} />
                </Row>
                <Row label="IPFS">
                  <span className="block max-w-40 truncate font-mono text-xs" title={p.metaCid}>
                    {p.metaCid}
                  </span>
                </Row>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="milestones" className="mt-4">
          <Card>
            <CardContent>
              <MilestoneTimeline milestones={milestones} threshold={p.approvalThreshold} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grievances" className="mt-4 flex flex-col gap-3">
          {user?.role !== "CITIZEN" && <p className="text-muted-foreground text-sm">{t("citizen.signInToFile")}</p>}
          {(grievances.data ?? []).length === 0 ? (
            <EmptyState title={t("projects.noGrievances")} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {grievances.data!.map((g) => (
                <GrievanceCard key={g.id} g={g} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          <ProjectLedger projectId={p.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

export function EventsTable({ events, showContract = true }: { events: ChainEvent[]; showContract?: boolean }) {
  const { t, i18n } = useTranslation();
  if (events.length === 0) return <EmptyState title={t("ledger.empty")} />;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("ledger.event")}</TableHead>
            {showContract && <TableHead>{t("ledger.contract")}</TableHead>}
            <TableHead>{t("common.block")}</TableHead>
            <TableHead>{t("common.date")}</TableHead>
            <TableHead>{t("common.tx")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => (
            <TableRow key={`${e.txHash}-${e.logIndex}`}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {e.eventName} {!e.confirmed && <PendingBadge />}
                </span>
              </TableCell>
              {showContract && <TableCell className="text-muted-foreground text-xs">{e.contract}</TableCell>}
              <TableCell className="font-mono text-xs">{e.blockNumber}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{formatDateTime(e.blockTime, i18n.language)}</TableCell>
              <TableCell>
                <TxLink hash={e.txHash} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectLedger({ projectId }: { projectId: number }) {
  const q = useApi(["/api/ledger", { projectId }], () => listLedgerEvents({ projectId, includePending: true, limit: 100 }));
  if (q.isLoading) return <LoadingRows />;
  return <EventsTable events={q.data?.items ?? []} />;
}
