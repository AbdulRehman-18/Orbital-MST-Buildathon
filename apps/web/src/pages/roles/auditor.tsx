import {
  getProject,
  listGrievances,
  listMilestones,
  listProjects,
  pinMetadata,
  type Grievance,
  type MilestoneWithProject,
  type Project,
} from "@namma-seva/api-client";
import { useQueries } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, FileSearch, Megaphone, PauseCircle, PlayCircle, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { AddressLink, Amount, EmptyState, Field, LoadingRows, PageHeader, StatCard } from "@/components/common/bits";
import { IpfsText, ProofGallery } from "@/components/common/chain-content";
import { GrievanceCard } from "@/components/common/grievances";
import { GpsDiffMap } from "@/components/common/project-map";
import { RoleGate } from "@/components/common/role-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { ActionDialog } from "@/components/dashboard/action-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { e6 } from "@/lib/format";
import { useChainTx } from "@/lib/tx";

export default function AuditorDashboard() {
  return (
    <RoleGate role="AUDITOR">
      <Auditor />
    </RoleGate>
  );
}

function Auditor() {
  const { t } = useTranslation();
  const pending = useApi(["/api/projects", { status: "PENDING_APPROVAL" }], () => listProjects({ status: "PENDING_APPROVAL", limit: 200 }));
  const paused = useApi(["/api/projects", { status: "PAUSED" }], () => listProjects({ status: "PAUSED", limit: 200 }));
  const proofs = useApi(["/api/milestones", { status: "PROOF_SUBMITTED" }], () => listMilestones({ status: "PROOF_SUBMITTED" }));
  const escalated = useApi(["/api/grievances", { status: "ESCALATED" }], () => listGrievances({ status: "ESCALATED", limit: 100 }));
  const open = useApi(["/api/grievances", { status: "OPEN" }], () => listGrievances({ status: "OPEN", limit: 100 }));
  const all = useApi(["/api/projects", "all"], () => listProjects({ limit: 200 }));
  const titleOf = (id: number) => all.data?.items.find((p) => p.id === id)?.title;

  const pendingItems = pending.data?.items ?? [];
  const proofItems = proofs.data ?? [];
  const grievanceItems = [...(escalated.data ?? []), ...(open.data ?? [])];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader icon={ShieldCheck} title={t("auditor.title")} subtitle={t("auditor.subtitle")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("auditor.queueProjects")} value={pendingItems.length} icon={ClipboardCheck} tone="warning" loading={pending.isLoading} />
        <StatCard label={t("auditor.queueProofs")} value={proofItems.length} icon={FileSearch} tone="primary" loading={proofs.isLoading} />
        <StatCard label={t("auditor.queueGrievances")} value={escalated.data?.length ?? 0} icon={Megaphone} tone="civic" loading={escalated.isLoading} />
        <StatCard label={t("auditor.queuePaused")} value={paused.data?.items.length ?? 0} icon={PauseCircle} tone="default" loading={paused.isLoading} />
      </div>

      <Tabs defaultValue="proofs">
        <TabsList className="flex-wrap">
          <TabsTrigger value="proofs">
            {t("auditor.queueProofs")} ({proofItems.length})
          </TabsTrigger>
          <TabsTrigger value="projects">
            {t("auditor.queueProjects")} ({pendingItems.length})
          </TabsTrigger>
          <TabsTrigger value="grievances">
            {t("common.grievances")} ({grievanceItems.length})
          </TabsTrigger>
          <TabsTrigger value="paused">
            {t("auditor.queuePaused")} ({paused.data?.items.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="proofs" className="mt-4 flex flex-col gap-4">
          {proofs.isLoading ? (
            <LoadingRows />
          ) : proofItems.length === 0 ? (
            <EmptyState icon={FileSearch} title={t("auditor.emptyProofs")} />
          ) : (
            proofItems.map((m) => <ProofReview key={m.id} m={m} />)
          )}
        </TabsContent>

        <TabsContent value="projects" className="mt-4 flex flex-col gap-4">
          {pending.isLoading ? (
            <LoadingRows />
          ) : pendingItems.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title={t("auditor.emptyProjects")} />
          ) : (
            <ProjectApprovals projects={pendingItems} />
          )}
        </TabsContent>

        <TabsContent value="grievances" className="mt-4 flex flex-col gap-3">
          {grievanceItems.length === 0 ? (
            <EmptyState icon={Megaphone} title={t("auditor.emptyGrievances")} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {grievanceItems.map((g) => (
                <div key={g.id} className="flex flex-col gap-2">
                  <GrievanceCard g={g} showProject projectTitle={titleOf(g.projectId)} />
                  <RespondButton g={g} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="paused" className="mt-4 flex flex-col gap-3">
          {(paused.data?.items ?? []).length === 0 ? (
            <EmptyState icon={PauseCircle} title={t("auditor.emptyPaused")} />
          ) : (
            paused.data!.items.map((p) => (
              <Card key={p.id} className="gap-0 py-4">
                <CardContent className="flex flex-wrap items-center gap-3 px-4">
                  <StatusBadge status={p.status} />
                  <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                    {p.title ?? `#${p.id}`}
                  </Link>
                  <ResumeButton p={p} />
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProofReview({ m }: { m: MilestoneWithProject }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const me = user!.walletAddress;
  const { send } = useChainTx();
  const approved = !!me && m.approvers.includes(me);
  const conflict = me === m.project.officialAddr || me === m.project.contractorAddr;
  const site: [number, number] = [e6(m.project.latE6), e6(m.project.lngE6)];
  const proof: [number, number] | null = m.proofLatE6 !== null && m.proofLngE6 !== null ? [e6(m.proofLatE6), e6(m.proofLngE6)] : null;

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={m.status} />
          <span className="text-muted-foreground text-xs">
            {t("projects.approvalsOf", { count: m.approvalCount, total: m.project.approvalThreshold })}
          </span>
          {m.round > 0 && <span className="rounded bg-amber-500/10 px-1.5 text-xs text-amber-700">round {m.round + 1}</span>}
        </div>
        <CardTitle className="text-base">{m.title ?? `${t("common.milestone")} #${m.id}`}</CardTitle>
        <Link href={`/projects/${m.projectId}`} className="text-muted-foreground text-sm hover:underline">
          {m.project.title} · {t("common.ward")} {m.project.wardId}
        </Link>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="flex flex-col gap-3">
          <ProofGallery milestoneId={m.id} />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">
              {t("common.amount")}: <Amount value={m.amount} className="text-foreground font-medium" />
            </span>
            <span className="text-muted-foreground">
              {t("common.contractor")}: <AddressLink address={m.submittedBy} />
            </span>
            {m.approvers.length > 0 && (
              <span className="text-muted-foreground flex flex-wrap items-center gap-1">
                {t("common.approvals")}: {m.approvers.map((a) => <AddressLink key={a} address={a} you={a === me} />)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {approved ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-teal-600">
                <CheckCircle2 className="size-4" /> {t("auditor.approvedByYou")}
              </span>
            ) : conflict ? (
              <span className="text-muted-foreground text-sm">{t("auditor.conflict")}</span>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    void send({
                      label: t("auditor.approve"),
                      contract: "MilestoneEscrow",
                      functionName: "approveMilestone",
                      args: [BigInt(m.id)],
                      kind: "approveMilestone",
                      entityId: m.id,
                    })
                  }
                >
                  <CheckCircle2 /> {t("auditor.approve")}
                </Button>
                <RejectButton
                  label={t("auditor.reject")}
                  projectId={m.projectId}
                  onReason={(hash) => ({
                    label: t("auditor.reject"),
                    contract: "MilestoneEscrow",
                    functionName: "rejectMilestone",
                    args: [BigInt(m.id), hash],
                    kind: "rejectMilestone",
                    entityId: m.id,
                  })}
                />
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("auditor.gpsDiff")}</p>
          <GpsDiffMap site={site} proof={proof} className="h-64" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectApprovals({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const me = user!.walletAddress;
  const { send } = useChainTx();
  // Who already approved each project (the list endpoint carries only the count).
  const details = useQueries({
    queries: projects.map((p) => ({ queryKey: ["/api/projects", p.id], queryFn: () => getProject(p.id) })),
  });

  return (
    <div className="flex flex-col gap-3">
      {projects.map((p, i) => {
        const approvals = details[i]?.data?.approvals ?? [];
        const approved = approvals.some((a) => a.auditorAddr === me);
        return (
          <Card key={p.id} className="gap-0 py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={p.status} />
                <span className="text-muted-foreground text-xs">
                  #{p.id} · {t("common.ward")} {p.wardId} · {t(`categories.${p.category}`)}
                </span>
                <span className="text-muted-foreground ml-auto text-xs">{t("projects.approvalsOf", { count: p.approvalCount, total: p.approvalThreshold })}</span>
              </div>
              <Link href={`/projects/${p.id}`} className="font-semibold hover:underline">
                {p.title ?? `#${p.id}`}
              </Link>
              {p.description && <p className="text-muted-foreground line-clamp-2 text-sm">{p.description}</p>}
              <div className="text-muted-foreground flex flex-wrap gap-x-4 text-sm">
                <span>
                  {t("common.budget")}: <Amount value={p.budget} className="text-foreground font-medium" />
                </span>
                <span>
                  {t("common.official")}: <AddressLink address={p.officialAddr} />
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {approved ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-teal-600">
                    <CheckCircle2 className="size-4" /> {t("auditor.approvedByYou")}
                  </span>
                ) : me === p.officialAddr ? (
                  <span className="text-muted-foreground text-sm">{t("auditor.conflict")}</span>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        void send({
                          label: t("auditor.approve"),
                          contract: "ProjectRegistry",
                          functionName: "approveProject",
                          args: [BigInt(p.id)],
                          kind: "approveProject",
                          entityId: p.id,
                        })
                      }
                    >
                      <CheckCircle2 /> {t("auditor.approve")}
                    </Button>
                    <RejectButton
                      label={t("auditor.reject")}
                      projectId={p.id}
                      onReason={(hash) => ({
                        label: t("auditor.reject"),
                        contract: "ProjectRegistry",
                        functionName: "rejectProject",
                        args: [BigInt(p.id), hash],
                        kind: "rejectProject",
                        entityId: p.id,
                      })}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RejectButton({
  label,
  projectId,
  onReason,
}: {
  label: string;
  projectId: number;
  onReason: (hash: `0x${string}`) => Parameters<ReturnType<typeof useChainTx>["send"]>[0];
}) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const [reason, setReason] = useState("");
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          <XCircle /> {label}
        </Button>
      )}
      title={t("auditor.rejectTitle")}
      description={t("auditor.rejectBody")}
      submitLabel={label}
      destructive
      disabled={reason.trim().length < 5}
      onSubmit={async () => {
        const meta = await pinMetadata({ kind: "reason", title: reason.trim(), projectId });
        return !!(await send(onReason(meta.hash as `0x${string}`)));
      }}
    >
      <Field label={t("common.reason")}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("auditor.reasonPlaceholder")} rows={3} />
      </Field>
    </ActionDialog>
  );
}

function RespondButton({ g }: { g: Grievance }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const [text, setText] = useState("");
  const [action, setAction] = useState<"PAUSE_PROJECT" | "DISMISS">("DISMISS");
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant={g.status === "ESCALATED" ? "default" : "outline"} className="w-fit" onClick={open}>
          <Megaphone /> {t("auditor.respond")}
        </Button>
      )}
      title={t("auditor.respondTitle")}
      submitLabel={t("auditor.respond")}
      disabled={text.trim().length < 5}
      destructive={action === "PAUSE_PROJECT"}
      onSubmit={async () => {
        const meta = await pinMetadata({ kind: "grievance-response", title: text.trim(), projectId: g.projectId });
        return !!(await send({
          label: t("auditor.respond"),
          contract: "GrievanceRegistry",
          functionName: "respond",
          args: [BigInt(g.id), meta.cid, action === "PAUSE_PROJECT" ? 1 : 2],
          kind: "respondGrievance",
          entityId: g.id,
        }));
      }}
    >
      <div className="bg-muted/60 rounded-md p-3">
        <p className="text-muted-foreground mb-1 text-xs font-semibold">{t("auditor.citizenSays")}</p>
        <IpfsText cid={g.cid} />
      </div>
      <Field label={t("projects.response")}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("auditor.responsePlaceholder")} rows={3} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["DISMISS", "PAUSE_PROJECT"] as const).map((a) => (
          <label key={a} className="has-checked:border-primary flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
            <input type="radio" name={`action-${g.id}`} className="accent-primary" checked={action === a} onChange={() => setAction(a)} />
            {a === "PAUSE_PROJECT" ? t("auditor.actionPause") : t("auditor.actionDismiss")}
          </label>
        ))}
      </div>
    </ActionDialog>
  );
}

function ResumeButton({ p }: { p: Project }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  return (
    <Button
      size="sm"
      variant="outline"
      className="ml-auto"
      onClick={() =>
        void send({ label: t("auditor.resume"), contract: "ProjectRegistry", functionName: "resumeProject", args: [BigInt(p.id)], kind: "resumeProject", entityId: p.id })
      }
    >
      <PlayCircle /> {t("auditor.resume")}
    </Button>
  );
}
