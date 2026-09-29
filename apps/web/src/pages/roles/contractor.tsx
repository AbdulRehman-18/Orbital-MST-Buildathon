import {
  listMilestones,
  listProjects,
  listTenders,
  type MilestoneWithProject,
  type ProofUploadResponse,
} from "@namma-seva/api-client";
import {
  BadgeIndianRupee,
  Camera,
  Clock,
  Gavel,
  HardHat,
  LayoutDashboard,
  LocateFixed,
  MapPin,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "wouter";
import { Amount, EmptyState, Field, LoadingRows, StatCard } from "@/components/common/bits";
import { CATEGORY_VISUAL, ROLE_VISUAL, ToneIcon } from "@/components/common/tone";
import { Panel, RolePanel, usePanelTab } from "@/components/layout/role-panel";
import { useNameOf } from "@/lib/names";
import { ProjectCard } from "@/components/common/project-card";
import { RoleGate } from "@/components/common/role-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { ActionDialog } from "@/components/dashboard/action-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { uploadForm, useApi, useDemo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { e6 } from "@/lib/format";
import { useChainTx } from "@/lib/tx";
import { BidActions } from "@/components/dashboard/bid-actions";
import { TenderCard } from "../tenders";

export default function ContractorDashboard() {
  return (
    <RoleGate role="CONTRACTOR">
      <Contractor />
    </RoleGate>
  );
}

function Contractor() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const me = user!.walletAddress!;
  const projects = useApi(["/api/projects", { contractor: me }], () =>
    listProjects({ contractor: me, limit: 200 }),
  );
  const milestones = useApi(["/api/milestones", { contractor: me }], () =>
    listMilestones({ contractor: me }),
  );
  const tenders = useApi(["/api/tenders", { status: "OPEN" }], () =>
    listTenders({ status: "OPEN" }),
  );
  const allProjects = useApi(["/api/projects", "all"], () => listProjects({ limit: 200 }));
  const [tab, go] = usePanelTab("/contractor", ["overview", "review", "projects", "tenders"]);
  const nameOf = useNameOf();

  const ms = milestones.data ?? [];
  const todo = ms.filter(
    (m) => (m.status === "PENDING" || m.status === "REJECTED") && m.project.status === "ACTIVE",
  );
  const review = ms.filter((m) => m.status === "PROOF_SUBMITTED" || m.status === "APPROVED");
  const paid = ms.filter((m) => m.status === "PAID");
  const earned = paid.reduce((n, m) => n + BigInt(m.amount), 0n);

  const myProjects = projects.data?.items ?? [];
  const catOf = (id: number) => myProjects.find((p) => p.id === id)?.category;

  return (
    <RolePanel
      tab={tab}
      onTab={go}
      badge={
        <ToneIcon
          icon={ROLE_VISUAL.CONTRACTOR.icon}
          tone={ROLE_VISUAL.CONTRACTOR.tone}
          className="size-14 rounded-2xl"
        />
      }
      title={nameOf(me)?.name ?? t("contractor.title")}
      subtitle={t("contractor.subtitle")}
      tabs={[
        {
          value: "overview",
          label: t("citizen.tabOverview"),
          icon: LayoutDashboard,
          tone: "slate",
        },
        {
          value: "review",
          label: t("contractor.inReview"),
          icon: Clock,
          tone: "blue",
          count: review.length,
        },
        {
          value: "projects",
          label: t("contractor.myProjects"),
          icon: HardHat,
          tone: "amber",
          count: myProjects.length,
        },
        {
          value: "tenders",
          label: t("contractor.tenders"),
          icon: Gavel,
          tone: "violet",
          count: tenders.data?.length ?? 0,
        },
      ]}
    >
      <TabsContent value="overview" className="flex flex-col gap-6">
        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border lg:grid-cols-4">
          <StatCard
            label={t("contractor.todo")}
            value={todo.length}
            icon={Camera}
            tone="warning"
            loading={milestones.isLoading}
          />
          <StatCard
            label={t("contractor.inReview")}
            value={review.length}
            icon={Clock}
            tone="primary"
            loading={milestones.isLoading}
          />
          <StatCard
            label={t("contractor.paid")}
            value={paid.length}
            icon={BadgeIndianRupee}
            tone="success"
            loading={milestones.isLoading}
          />
          <StatCard
            label={t("contractor.earned")}
            value={<Amount value={earned} compact />}
            icon={BadgeIndianRupee}
            tone="civic"
            loading={milestones.isLoading}
          />
        </section>
        <Panel title={t("contractor.todo")}>
          {milestones.isLoading ? (
            <LoadingRows />
          ) : todo.length === 0 ? (
            <p className="text-muted-foreground px-5 py-10 text-center text-sm">
              {t("common.noResults")}
            </p>
          ) : (
            <ul className="divide-y">
              {todo.map((m) => (
                <MilestoneRow
                  key={m.id}
                  m={m}
                  category={catOf(m.projectId)}
                  action={<ProofDialog m={m} />}
                />
              ))}
            </ul>
          )}
        </Panel>
      </TabsContent>
      <TabsContent value="review" className="flex flex-col gap-3">
        {review.length === 0 ? (
          <EmptyState icon={Clock} title={t("common.noResults")} />
        ) : (
          review.map((m) => <MilestoneRow key={m.id} m={m} category={catOf(m.projectId)} />)
        )}
      </TabsContent>
      <TabsContent value="projects">
        {myProjects.length === 0 ? (
          <EmptyState icon={HardHat} title={t("contractor.noProjects")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myProjects.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </TabsContent>
      <TabsContent value="tenders">
        {(tenders.data ?? []).length === 0 ? (
          <EmptyState icon={Gavel} title={t("common.noResults")} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {(tenders.data ?? []).map((tn) => (
              <TenderCard
                key={tn.id}
                tender={tn}
                projectTitle={allProjects.data?.items.find((p) => p.id === tn.projectId)?.title}
                footer={<BidActions tender={tn} />}
              />
            ))}
          </div>
        )}
      </TabsContent>
    </RolePanel>
  );
}

function MilestoneRow({
  m,
  category,
  action,
}: {
  m: MilestoneWithProject;
  category?: string;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const v = CATEGORY_VISUAL[category ?? "OTHER"] ?? CATEGORY_VISUAL.OTHER;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ToneIcon icon={v.icon} tone={v.tone} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{m.title ?? `${t("common.milestone")} #${m.id}`}</p>
          <Link
            href={`/projects/${m.projectId}`}
            className="text-muted-foreground block truncate text-sm hover:underline"
          >
            {m.project.title}
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        {m.status === "PROOF_SUBMITTED" && (
          <span className="text-muted-foreground text-xs">
            {t("projects.approvalsOf", {
              count: m.approvalCount,
              total: m.project.approvalThreshold,
            })}
          </span>
        )}
        <StatusBadge status={m.status} />
        <Amount value={m.amount} className="font-medium tabular-nums" />
        {action}
      </div>
    </li>
  );
}

function ProofDialog({ m }: { m: MilestoneWithProject }) {
  const { t } = useTranslation();
  const demo = useDemo();
  const { send } = useChainTx();
  const [files, setFiles] = useState<File[]>([]);
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [note, setNote] = useState("");
  const [uploaded, setUploaded] = useState<ProofUploadResponse | null>(null);
  const [locating, setLocating] = useState(false);
  const site: [number, number] = [e6(m.project.latE6), e6(m.project.lngE6)];

  function locate() {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setGps([pos.coords.latitude, pos.coords.longitude]);
        setLocating(false);
      },
      () => {
        toast.error(t("contractor.gpsMissing"));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function submit(): Promise<boolean> {
    let proof = uploaded;
    if (!proof) {
      const form = new FormData();
      files.forEach((f) => form.append("photos", f));
      if (gps) {
        form.append("latE6", String(Math.round(gps[0] * 1e6)));
        form.append("lngE6", String(Math.round(gps[1] * 1e6)));
      }
      if (note.trim()) form.append("note", note.trim());
      const id = toast.loading(t("contractor.uploading"));
      try {
        proof = await uploadForm<ProofUploadResponse>(`/api/milestones/${m.id}/proof/upload`, form);
      } finally {
        toast.dismiss(id);
      }
      setUploaded(proof);
      toast.info(t("contractor.uploaded"), {
        description: proof.warnings.join(" · ") || undefined,
      });
    }
    const hash = await send({
      label: t("contractor.submitProof"),
      contract: "MilestoneEscrow",
      functionName: "submitProof",
      args: [BigInt(m.id), proof.proofCID, proof.proofHash, proof.latE6, proof.lngE6],
      kind: "submitProof",
      entityId: m.id,
    });
    if (hash) {
      setUploaded(null);
      setFiles([]);
      setNote("");
    }
    return !!hash;
  }

  return (
    <ActionDialog
      trigger={(open) => (
        <Button onClick={open}>
          <Camera />{" "}
          {m.status === "REJECTED" ? t("contractor.resubmit") : t("contractor.submitProof")}
        </Button>
      )}
      title={t("contractor.proofTitle")}
      description={t("contractor.proofBody")}
      submitLabel={
        uploaded ? t("contractor.submitProof") : `${t("common.submit")} · ${files.length}`
      }
      disabled={!uploaded && files.length === 0}
      onSubmit={submit}
    >
      <Field label={t("contractor.photos")}>
        <label className="hover:border-primary flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm">
          <Upload className="text-muted-foreground size-6" />
          {files.length ? files.map((f) => f.name).join(", ") : t("contractor.takePhoto")}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []).slice(0, 5));
              setUploaded(null);
            }}
          />
        </label>
      </Field>
      <Field
        label={t("contractor.gps")}
        hint={gps ? `${gps[0].toFixed(5)}, ${gps[1].toFixed(5)}` : t("contractor.gpsMissing")}
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={locate} disabled={locating}>
            <LocateFixed /> {t("contractor.gpsLocate")}
          </Button>
          {demo.data?.enabled && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setGps([site[0] + 0.0001, site[1] - 0.0001])}
            >
              <MapPin /> {t("contractor.gpsUseSite")}
            </Button>
          )}
        </div>
      </Field>
      <Field label={`${t("contractor.note")} (${t("common.optional")})`}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
      {uploaded && uploaded.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="mb-1 font-semibold">{t("contractor.warnings")}</p>
          <ul className="list-disc pl-4">
            {uploaded.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </ActionDialog>
  );
}
