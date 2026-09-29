import {
  listDepartments,
  listMilestones,
  listProjects,
  listRoleHolders,
  listTenders,
  listWards,
  pinMetadata,
  prepareProject,
  type MilestoneWithProject,
  type Project,
  type ProjectCategory,
} from "@namma-seva/api-client";
import {
  BadgeIndianRupee,
  Building2,
  CheckCheck,
  Gavel,
  Hourglass,
  LayoutDashboard,
  ListPlus,
  Lock,
  MapPin,
  Plus,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { keccak256, toBytes, zeroHash } from "viem";
import { Link } from "wouter";
import {
  Amount,
  EmptyState,
  Field,
  LoadingRows,
  ProgressBar,
  StatCard,
} from "@/components/common/bits";
import { CATEGORY_VISUAL, ROLE_VISUAL, ToneIcon } from "@/components/common/tone";
import { Panel, RolePanel, ViewAll, usePanelTab } from "@/components/layout/role-panel";
import { TabsContent } from "@/components/ui/tabs";
import { useNameOf } from "@/lib/names";
import { wagmiConfig } from "@/lib/wagmi";
import { getBlock } from "wagmi/actions";
import { TenderCard } from "../tenders";
import { MilestoneTimeline } from "@/components/common/chain-content";
import { LocationPicker } from "@/components/common/project-map";
import { RoleGate } from "@/components/common/role-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { ActionDialog } from "@/components/dashboard/action-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useApi, useMode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ALL_WARDS, network } from "@/lib/chain";
import { formatAmount, percent, toChainAmount } from "@/lib/format";
import { useChainTx } from "@/lib/tx";
import { wardName } from "@/lib/wards";

const CATEGORIES: ProjectCategory[] = [
  "ROAD",
  "DRAINAGE",
  "WATER_SUPPLY",
  "STREET_LIGHTING",
  "PARK",
  "BUILDING",
  "OTHER",
];
const refHash = (text: string) => keccak256(toBytes(text.trim()));

export default function OfficialDashboard() {
  return (
    <RoleGate role="GOVT_OFFICIAL">
      <Official />
    </RoleGate>
  );
}

function Official() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const me = user!.walletAddress!;
  const projects = useApi(["/api/projects", { official: me }], () =>
    listProjects({ official: me, limit: 200 }),
  );
  const milestones = useApi(["/api/milestones", { official: me }], () =>
    listMilestones({ official: me }),
  );
  const tenders = useApi(["/api/tenders"], () => listTenders());
  const [creating, setCreating] = useState(false);
  const [tab, go] = usePanelTab("/official", ["overview", "projects", "milestones", "tenders"]);
  const nameOf = useNameOf();

  const items = projects.data?.items ?? [];
  const ms = milestones.data ?? [];
  const toRelease = ms.filter((m) => m.status === "APPROVED");
  const spent = items.reduce((n, p) => n + BigInt(p.spent), 0n);

  const pendingApproval = items.filter((p) => p.status === "PENDING_APPROVAL");
  const mine = new Set(items.map((p) => p.id));
  const myTenders = (tenders.data ?? []).filter((tn) => mine.has(tn.projectId));
  const hasOpenTender = (id: number) =>
    myTenders.some((tn) => tn.projectId === id && tn.status === "OPEN");
  const needContractor = items.filter(
    (p) =>
      !p.contractorAddr &&
      !hasOpenTender(p.id) &&
      (p.status === "ACTIVE" || p.status === "PENDING_APPROVAL"),
  );
  const titleOf = (id: number) => items.find((p) => p.id === id)?.title;
  const newProject = (
    <Button onClick={() => setCreating(true)}>
      <Plus /> {t("official.newProject")}
    </Button>
  );

  return (
    <RolePanel
      tab={tab}
      onTab={go}
      badge={
        <ToneIcon
          icon={ROLE_VISUAL.GOVT_OFFICIAL.icon}
          tone={ROLE_VISUAL.GOVT_OFFICIAL.tone}
          className="size-14 rounded-2xl"
        />
      }
      title={nameOf(me)?.name ?? t("official.title")}
      subtitle={t("official.subtitle")}
      action={newProject}
      tabs={[
        {
          value: "overview",
          label: t("citizen.tabOverview"),
          icon: LayoutDashboard,
          tone: "slate",
        },
        {
          value: "projects",
          label: t("official.myProjects"),
          icon: Building2,
          tone: "blue",
          count: items.length,
        },
        {
          value: "milestones",
          label: t("official.milestonesTab"),
          icon: ListPlus,
          tone: "green",
          count: ms.length,
        },
        {
          value: "tenders",
          label: t("nav.tenders"),
          icon: Gavel,
          tone: "violet",
          count: myTenders.length,
        },
      ]}
    >
      <TabsContent value="overview" className="flex flex-col gap-6">
        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border lg:grid-cols-4">
          <StatCard
            label={t("official.kpiProjects")}
            value={items.length}
            icon={Building2}
            tone="primary"
            loading={projects.isLoading}
          />
          <StatCard
            label={t("official.kpiPending")}
            value={pendingApproval.length}
            icon={Hourglass}
            tone="warning"
            loading={projects.isLoading}
          />
          <StatCard
            label={t("official.kpiToRelease")}
            value={toRelease.length}
            icon={BadgeIndianRupee}
            tone="civic"
            loading={milestones.isLoading}
          />
          <StatCard
            label={t("official.kpiSpent")}
            value={<Amount value={spent} compact />}
            icon={Wallet}
            tone="success"
            loading={projects.isLoading}
          />
        </section>

        {user!.wards.length > 0 && (
          <p className="text-muted-foreground text-sm">
            {t("official.wardsYouManage")}:{" "}
            <span className="text-foreground font-medium">
              {user!.wards.includes(ALL_WARDS) ? t("common.allWards") : user!.wards.join(", ")}
            </span>
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title={t("official.toRelease")}>
            {milestones.isLoading ? (
              <LoadingRows rows={2} />
            ) : toRelease.length === 0 ? (
              <p className="text-muted-foreground px-5 py-10 text-center text-sm">
                {t("common.noResults")}
              </p>
            ) : (
              <ul className="divide-y">
                {toRelease.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <ToneIcon icon={CheckCheck} tone="green" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <Link
                        href={`/projects/${m.projectId}`}
                        className="text-muted-foreground block truncate text-xs hover:underline"
                      >
                        {m.project.title}
                      </Link>
                    </div>
                    <Amount value={m.amount} className="text-sm font-medium" />
                    <ReleaseButton m={m} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={t("status.PENDING_APPROVAL")}
            action={<ViewAll onClick={() => go("projects")} />}
          >
            {projects.isLoading ? (
              <LoadingRows rows={2} />
            ) : pendingApproval.length === 0 ? (
              <p className="text-muted-foreground px-5 py-10 text-center text-sm">
                {t("common.noResults")}
              </p>
            ) : (
              <ul className="divide-y">
                {pendingApproval.map((p) => {
                  const v = CATEGORY_VISUAL[p.category] ?? CATEGORY_VISUAL.OTHER;
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        className="hover:bg-muted/60 flex items-center gap-3 px-5 py-3.5 transition-colors"
                      >
                        <ToneIcon icon={v.icon} tone={v.tone} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {p.title ?? `#${p.id}`}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {p.approvalCount}/{p.approvalThreshold}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </TabsContent>

      <TabsContent value="projects">
        {projects.isLoading ? (
          <LoadingRows rows={3} />
        ) : items.length === 0 ? (
          <EmptyState icon={Building2} title={t("official.noProjects")} action={newProject} />
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((p) => (
              <OfficialProjectCard
                key={p.id}
                p={p}
                milestones={ms.filter((m) => m.projectId === p.id)}
                hasOpenTender={(tenders.data ?? []).some(
                  (tn) => tn.projectId === p.id && tn.status === "OPEN",
                )}
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="milestones" className="flex flex-col gap-6">
        {projects.isLoading ? (
          <LoadingRows rows={3} />
        ) : items.length === 0 ? (
          <EmptyState icon={Building2} title={t("official.noProjects")} action={newProject} />
        ) : (
          items
            .filter((p) => p.status !== "CANCELLED")
            .map((p) => {
              const pms = ms.filter((m) => m.projectId === p.id);
              const note =
                p.status === "PENDING_APPROVAL"
                  ? t("official.milestonesLocked")
                  : p.status === "ACTIVE" && BigInt(p.funded) === 0n
                    ? t("official.milestonesNeedFunds")
                    : null;
              return (
                <Panel
                  key={p.id}
                  title={
                    <Link href={`/projects/${p.id}`} className="hover:underline">
                      {p.title ?? `#${p.id}`}
                    </Link>
                  }
                  action={
                    p.status === "ACTIVE" && (
                      <div className="flex gap-2">
                        {BigInt(p.funded) < BigInt(p.budget) && <FundButton p={p} />}
                        {BigInt(p.funded) > 0n && (
                          <AddMilestoneButton p={p} available={availableOf(p, pms)} />
                        )}
                      </div>
                    )
                  }
                >
                  <div className="flex flex-col gap-3 p-5">
                    {note && <p className="tone-amber text-sm text-(--tone-fg)">{note}</p>}
                    {pms.length === 0 ? (
                      !note && (
                        <p className="text-muted-foreground text-sm">
                          {t("official.noMilestones")}
                        </p>
                      )
                    ) : (
                      <MilestoneTimeline
                        milestones={pms}
                        threshold={p.approvalThreshold}
                        actions={(m) =>
                          m.status === "APPROVED" ? (
                            <ReleaseButton m={m as MilestoneWithProject} />
                          ) : null
                        }
                      />
                    )}
                  </div>
                </Panel>
              );
            })
        )}
      </TabsContent>

      <TabsContent value="tenders" className="flex flex-col gap-6">
        <Panel title={t("official.needContractor")}>
          {needContractor.length === 0 ? (
            <p className="text-muted-foreground px-5 py-8 text-center text-sm">
              {t("official.allHaveContractor")}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground border-b px-5 py-3 text-sm">
                {t("official.needContractorBody")}
              </p>
              <ul className="divide-y">
                {needContractor.map((p) => {
                  const v = CATEGORY_VISUAL[p.category] ?? CATEGORY_VISUAL.OTHER;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <ToneIcon icon={v.icon} tone={v.tone} size="sm" />
                      <Link
                        href={`/projects/${p.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {p.title ?? `#${p.id}`}
                      </Link>
                      <PublishTenderButton p={p} />
                      <AssignContractorButton p={p} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium tracking-tight">{t("official.yourTenders")}</h2>
          {myTenders.length === 0 ? (
            <EmptyState icon={Gavel} title={t("official.noTenders")} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {myTenders.map((tn) => (
                <TenderCard
                  key={tn.id}
                  tender={tn}
                  projectTitle={titleOf(tn.projectId)}
                  footer={
                    tn.status === "OPEN" && (
                      <>
                        {tn.phase === "AWAITING_AWARD" && tn.revealedCount > 0 ? (
                          <AwardButton tenderId={tn.id} projectId={tn.projectId} />
                        ) : (
                          <p className="text-muted-foreground flex-1 text-xs">
                            {t("official.awardWait")}
                          </p>
                        )}
                        <CancelTenderButton tenderId={tn.id} />
                      </>
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </TabsContent>

      <CreateProjectSheet open={creating} onOpenChange={setCreating} />
    </RolePanel>
  );
}

/** Sanctioned money not yet paid or committed to an open milestone. */
function availableOf(p: Project, milestones: MilestoneWithProject[]) {
  const committed = milestones
    .filter((m) => ["PENDING", "PROOF_SUBMITTED", "APPROVED", "REJECTED"].includes(m.status))
    .reduce((n, m) => n + BigInt(m.amount), 0n);
  return BigInt(p.funded) - BigInt(p.spent) - committed;
}

function OfficialProjectCard({
  p,
  milestones,
  hasOpenTender,
}: {
  p: Project;
  milestones: MilestoneWithProject[];
  hasOpenTender: boolean;
}) {
  const { t } = useTranslation();
  const active = p.status === "ACTIVE";
  const available = availableOf(p, milestones);
  const unsettled = milestones.some((m) => m.status !== "PAID" && m.status !== "VOID");
  const visual = CATEGORY_VISUAL[p.category] ?? CATEGORY_VISUAL.OTHER;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <ToneIcon icon={visual.icon} tone={visual.tone} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <CardTitle className="text-lg leading-snug font-medium">
              <Link href={`/projects/${p.id}`} className="hover:underline">
                {p.title ?? `#${p.id}`}
              </Link>
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {t(`categories.${p.category}`)}, {t("common.ward")} {p.wardId}
            </p>
          </div>
          <StatusBadge status={p.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <Metric label={t("common.budget")} value={<Amount value={p.budget} compact />} />
          <Metric label={t("common.funded")} value={<Amount value={p.funded} compact />} />
          <Metric label={t("common.spent")} value={<Amount value={p.spent} compact />} />
          <Metric
            label={t("official.available", { amount: "" }).replace(/[:：]\s*$/, "")}
            value={<Amount value={available > 0n ? available : 0n} compact />}
          />
        </div>
        <div className="flex flex-col gap-1">
          <ProgressBar value={percent(p.spent, p.budget)} />
          <p className="text-muted-foreground text-xs">
            {t("projects.budgetUsed", { pct: percent(p.spent, p.budget) })}
          </p>
        </div>
        {p.status === "PENDING_APPROVAL" && (
          <p className="tone-amber text-sm text-(--tone-fg)">
            {t("projects.approvalsOf", { count: p.approvalCount, total: p.approvalThreshold })}
          </p>
        )}
        {milestones.length > 0 && (
          <MilestoneTimeline
            milestones={milestones}
            threshold={p.approvalThreshold}
            actions={(m) =>
              m.status === "APPROVED" ? <ReleaseButton m={m as MilestoneWithProject} /> : null
            }
          />
        )}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {active && BigInt(p.funded) < BigInt(p.budget) && <FundButton p={p} />}
          {active && <AddMilestoneButton p={p} available={available} />}
          {!p.contractorAddr && !hasOpenTender && (active || p.status === "PENDING_APPROVAL") && (
            <>
              <PublishTenderButton p={p} />
              <AssignContractorButton p={p} />
            </>
          )}
          {hasOpenTender && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/tenders">
                <Gavel /> {t("nav.tenders")}
              </Link>
            </Button>
          )}
          {active && milestones.length > 0 && !unsettled && <CloseButton p={p} />}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function FundButton({ p }: { p: Project }) {
  const { t } = useTranslation();
  const mode = useMode();
  const { send } = useChainTx();
  const remaining = BigInt(p.budget) - BigInt(p.funded);
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState(`PFMS/BBMP/${new Date().getFullYear()}/${p.id}`);
  let value: bigint | null = null;
  try {
    value = amount ? toChainAmount(amount, mode) : null;
  } catch {
    value = null;
  }
  const valid =
    value !== null &&
    value > 0n &&
    value <= remaining &&
    (mode === "ESCROW" || ref.trim().length > 3);

  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          <BadgeIndianRupee /> {t("official.fund")}
        </Button>
      )}
      title={t("official.fundTitle")}
      description={mode === "ESCROW" ? t("official.fundEscrowBody") : t("official.fundBody")}
      submitLabel={t("official.fund")}
      disabled={!valid}
      onSubmit={async () =>
        !!(await send(
          mode === "ESCROW"
            ? {
                label: t("official.fund"),
                contract: "MilestoneEscrow",
                functionName: "fundProject",
                args: [BigInt(p.id)],
                value: value!,
                kind: "fundProject",
                entityId: p.id,
              }
            : {
                label: t("official.fund"),
                contract: "MilestoneEscrow",
                functionName: "recordSanction",
                args: [BigInt(p.id), value!, refHash(ref)],
                kind: "recordSanction",
                entityId: p.id,
              },
        ))
      }
    >
      <p className="text-muted-foreground text-sm">
        {t("official.remaining", { amount: formatAmount(remaining, mode) })}
      </p>
      <Field
        label={
          mode === "ESCROW"
            ? t("official.budgetCoins", { symbol: network.nativeCurrency.symbol })
            : t("official.budgetRupees")
        }
      >
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={mode === "ESCROW" ? "1.5" : "10,00,000"}
        />
      </Field>
      {mode !== "ESCROW" && (
        <Field label={t("official.sanctionRef")}>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} className="font-mono" />
        </Field>
      )}
    </ActionDialog>
  );
}

function AddMilestoneButton({ p, available }: { p: Project; available: bigint }) {
  const { t } = useTranslation();
  const mode = useMode();
  const { send } = useChainTx();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  let value: bigint | null = null;
  try {
    value = amount ? toChainAmount(amount, mode) : null;
  } catch {
    value = null;
  }
  const valid = title.trim().length >= 3 && value !== null && value > 0n && value <= available;

  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          <ListPlus /> {t("official.addMilestone")}
        </Button>
      )}
      title={t("official.milestoneTitle")}
      description={t("official.milestoneBody")}
      submitLabel={t("official.create")}
      disabled={!valid}
      onSubmit={async () => {
        const meta = await pinMetadata({
          kind: "milestone",
          title: title.trim(),
          description: description.trim() || undefined,
          projectId: p.id,
        });
        const hash = await send({
          label: t("official.addMilestone"),
          contract: "MilestoneEscrow",
          functionName: "createMilestone",
          args: [BigInt(p.id), meta.hash, meta.cid, value!],
          kind: "createMilestone",
          entityId: p.id,
        });
        if (hash) (setTitle(""), setDescription(""), setAmount(""));
        return !!hash;
      }}
    >
      <p className="text-muted-foreground text-sm">
        {t("official.available", { amount: formatAmount(available > 0n ? available : 0n, mode) })}
      </p>
      <Field label={t("common.title")}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bituminous concrete wearing course"
        />
      </Field>
      <Field label={`${t("common.description")} (${t("common.optional")})`}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>
      <Field
        label={
          mode === "ESCROW"
            ? t("official.budgetCoins", { symbol: network.nativeCurrency.symbol })
            : `${t("common.amount")} (₹)`
        }
      >
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="5,00,000"
        />
      </Field>
    </ActionDialog>
  );
}

function ReleaseButton({
  m,
}: {
  m: MilestoneWithProject | { id: number; projectId: number; amount: string };
}) {
  const { t } = useTranslation();
  const mode = useMode();
  const { send } = useChainTx();
  const [utr, setUtr] = useState("");
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          <BadgeIndianRupee /> {t("official.release")}
        </Button>
      )}
      title={t("official.releaseTitle")}
      description={t("official.releaseBody")}
      submitLabel={`${t("official.release")} · ${formatAmount(m.amount, mode)}`}
      disabled={mode !== "ESCROW" && utr.trim().length < 6}
      onSubmit={async () =>
        !!(await send({
          label: t("official.release"),
          contract: "MilestoneEscrow",
          functionName: "releaseFunds",
          args: [BigInt(m.id), mode === "ESCROW" ? zeroHash : refHash(utr)],
          kind: "releaseFunds",
          entityId: m.id,
        }))
      }
    >
      {mode !== "ESCROW" && (
        <Field label={t("official.utr")}>
          <Input
            value={utr}
            onChange={(e) => setUtr(e.target.value)}
            placeholder="SBIN0000123456789"
            className="font-mono"
          />
        </Field>
      )}
    </ActionDialog>
  );
}

function PublishTenderButton({ p }: { p: Project }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const [commitDays, setCommitDays] = useState("7");
  const [revealDays, setRevealDays] = useState("3");
  const [notes, setNotes] = useState("Sealed-bid commit/reveal. EMD 2%.");
  const valid = Number(commitDays) >= 1 && Number(revealDays) >= 1;
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          <Gavel /> {t("official.publishTender")}
        </Button>
      )}
      title={t("official.tenderTitle")}
      description={t("tenders.subtitle")}
      submitLabel={t("official.publishTender")}
      disabled={!valid}
      onSubmit={async () => {
        const meta = await pinMetadata({
          kind: "tender",
          title: `Tender — ${p.title ?? p.id}`,
          description: notes,
          projectId: p.id,
        });
        // Deadlines are checked against chain time (block.timestamp), so count from the chain's head, not this device's clock.
        const now = Number((await getBlock(wagmiConfig)).timestamp);
        const commit = now + Number(commitDays) * 86400;
        return !!(await send({
          label: t("official.publishTender"),
          contract: "TenderRegistry",
          functionName: "publishTender",
          args: [
            BigInt(p.id),
            meta.cid,
            BigInt(commit),
            BigInt(commit + Number(revealDays) * 86400),
          ],
          kind: "publishTender",
          entityId: p.id,
        }));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("official.commitDays")}>
          <Input
            type="number"
            min={1}
            value={commitDays}
            onChange={(e) => setCommitDays(e.target.value)}
          />
        </Field>
        <Field label={t("official.revealDays")}>
          <Input
            type="number"
            min={1}
            value={revealDays}
            onChange={(e) => setRevealDays(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t("common.description")}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </Field>
    </ActionDialog>
  );
}

function AwardButton({ tenderId, projectId }: { tenderId: number; projectId: number }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          <Gavel /> {t("official.award")}
        </Button>
      )}
      title={t("official.award")}
      description={t("official.awardBody")}
      submitLabel={t("official.award")}
      onSubmit={async () =>
        !!(await send({
          label: t("official.award"),
          contract: "TenderRegistry",
          functionName: "awardTender",
          args: [BigInt(tenderId)],
          kind: "awardTender",
          entityId: projectId,
        }))
      }
    />
  );
}

function CancelTenderButton({ tenderId }: { tenderId: number }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const [reason, setReason] = useState("");
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={open}>
          {t("official.cancelTender")}
        </Button>
      )}
      title={t("official.cancelTender")}
      submitLabel={t("official.cancelTender")}
      disabled={reason.trim().length < 5}
      onSubmit={async () =>
        !!(await send({
          label: t("official.cancelTender"),
          contract: "TenderRegistry",
          functionName: "cancelTender",
          args: [BigInt(tenderId), refHash(reason)],
          kind: "cancelTender",
          entityId: tenderId,
        }))
      }
    >
      <Field label={t("official.cancelReason")}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
      </Field>
    </ActionDialog>
  );
}

function AssignContractorButton({ p }: { p: Project }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const holders = useApi(["/api/roles"], () => listRoleHolders());
  const contractors = (holders.data ?? []).filter((h) => h.roles.includes("CONTRACTOR"));
  const nameOf = useNameOf();
  const [addr, setAddr] = useState("");
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          <UserPlus /> {t("official.assign")}
        </Button>
      )}
      title={t("official.assign")}
      submitLabel={t("official.assign")}
      disabled={!/^0x[0-9a-fA-F]{40}$/.test(addr)}
      onSubmit={async () =>
        !!(await send({
          label: t("official.assign"),
          contract: "ProjectRegistry",
          functionName: "assignContractor",
          args: [BigInt(p.id), addr],
          kind: "assignContractor",
          entityId: p.id,
        }))
      }
    >
      <Field label={t("common.contractor")}>
        <Select value={addr} onValueChange={setAddr}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common.contractor")} />
          </SelectTrigger>
          <SelectContent>
            {contractors.map((c) => (
              <SelectItem key={c.address} value={c.address}>
                {nameOf(c.address)?.name ?? c.address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </ActionDialog>
  );
}

function CloseButton({ p }: { p: Project }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant="outline" onClick={open}>
          <Lock /> {t("official.close")}
        </Button>
      )}
      title={t("official.close")}
      description={p.title ?? undefined}
      submitLabel={t("official.close")}
      onSubmit={async () =>
        !!(await send({
          label: t("official.close"),
          contract: "ProjectRegistry",
          functionName: "closeProject",
          args: [BigInt(p.id)],
          kind: "closeProject",
          entityId: p.id,
        }))
      }
    />
  );
}

function CreateProjectSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const mode = useMode();
  const { send } = useChainTx();
  const wards = useApi(["/api/wards"], () => listWards());
  const departments = useApi(["/api/departments"], () => listDepartments());
  const holders = useApi(["/api/roles"], () => listRoleHolders());
  const contractors = (holders.data ?? []).filter((h) => h.roles.includes("CONTRACTOR"));
  const nameOf = useNameOf();
  const allowed = (wards.data ?? []).filter(
    (w) =>
      user!.wards.includes(ALL_WARDS) || user!.wards.includes(w.id) || user!.wards.length === 0,
  );

  const today = new Date().toISOString().slice(0, 10);
  const inSixMonths = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);
  const [f, setF] = useState({
    title: "",
    description: "",
    location: "",
    category: "ROAD" as ProjectCategory,
    wardId: "",
    deptId: "1",
    budget: "",
    startDate: today,
    endDate: inSixMonths,
    contractor: "none",
    threshold: "2",
  });
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  let budget: bigint | null = null;
  try {
    budget = f.budget ? toChainAmount(f.budget, mode) : null;
  } catch {
    budget = null;
  }
  const valid =
    f.title.trim().length >= 3 &&
    f.description.trim().length >= 3 &&
    f.wardId &&
    pos &&
    budget &&
    budget > 0n &&
    f.endDate > f.startDate;

  // Explicit search only (Nominatim's policy forbids search-as-you-type); biased to India.
  async function findOnMap() {
    const q = f.location.trim();
    if (!q) return;
    setFinding(true);
    setNotFound(false);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`;
      const [hit] = (await (await fetch(url)).json()) as { lat: string; lon: string }[];
      if (hit) setPos([Number(hit.lat), Number(hit.lon)]);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setFinding(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      const prep = await prepareProject({
        title: f.title.trim(),
        description: f.description.trim(),
        location: f.location.trim() || undefined,
        category: f.category,
        wardId: Number(f.wardId),
        deptId: Number(f.deptId),
        latE6: Math.round(pos![0] * 1e6),
        lngE6: Math.round(pos![1] * 1e6),
        budget: budget!.toString(),
        startDate: new Date(f.startDate).toISOString(),
        endDate: new Date(f.endDate).toISOString(),
        contractorAddr: f.contractor === "none" ? null : f.contractor,
        approvalThreshold: Number(f.threshold),
      });
      const a = prep.args;
      const hash = await send({
        label: t("official.createTitle"),
        contract: "ProjectRegistry",
        functionName: "createProject",
        args: [
          {
            metaHash: a.metaHash,
            metaCID: a.metaCID,
            wardId: a.wardId,
            departmentId: a.departmentId,
            category: a.category,
            latE6: a.latE6,
            lngE6: a.lngE6,
            budget: BigInt(a.budget),
            startDate: BigInt(a.startDate),
            endDate: BigInt(a.endDate),
            contractor: a.contractor,
            approvalThreshold: a.approvalThreshold,
          },
        ],
        kind: "createProject",
      });
      if (hash) {
        onOpenChange(false);
        setF((s) => ({ ...s, title: "", description: "", location: "", budget: "" }));
        setPos(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("official.createTitle")}</SheetTitle>
          <SheetDescription>{t("official.createBody")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <Field label={t("common.title")}>
            <Input
              value={f.title}
              onChange={(e) => set("title")(e.target.value)}
              placeholder="Koramangala 6th Block footpath upgrade"
            />
          </Field>
          <Field label={t("common.description")}>
            <Textarea
              value={f.description}
              onChange={(e) => set("description")(e.target.value)}
              rows={3}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.category")}>
              <Select value={f.category} onValueChange={set("category")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`categories.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("common.department")}>
              <Select value={f.deptId} onValueChange={set("deptId")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {departments.data?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("common.ward")}>
              <Select value={f.wardId} onValueChange={set("wardId")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("common.ward")} />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.id} · {wardName(w, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={
                mode === "ESCROW"
                  ? t("official.budgetCoins", { symbol: network.nativeCurrency.symbol })
                  : t("official.budgetRupees")
              }
            >
              <Input
                inputMode="decimal"
                value={f.budget}
                onChange={(e) => set("budget")(e.target.value)}
                placeholder="25,00,000"
              />
            </Field>
            <Field label={t("common.start")}>
              <Input
                type="date"
                value={f.startDate}
                onChange={(e) => set("startDate")(e.target.value)}
              />
            </Field>
            <Field label={t("common.end")}>
              <Input
                type="date"
                value={f.endDate}
                onChange={(e) => set("endDate")(e.target.value)}
              />
            </Field>
            <Field label={t("common.contractor")}>
              <Select value={f.contractor} onValueChange={set("contractor")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("official.assignLater")}</SelectItem>
                  {contractors.map((c) => (
                    <SelectItem key={c.address} value={c.address}>
                      {nameOf(c.address)?.name ?? `${c.address.slice(0, 10)}…${c.address.slice(-6)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("official.threshold")}>
              <Select value={f.threshold} onValueChange={set("threshold")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label={t("common.location")}
            hint={
              notFound
                ? t("official.locationNotFound")
                : pos
                  ? `${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}`
                  : t("official.pickLocation")
            }
          >
            <div className="flex gap-2">
              <Input
                value={f.location}
                onChange={(e) => set("location")(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void findOnMap();
                  }
                }}
                placeholder="6th Block, Koramangala"
              />
              <Button type="button" variant="secondary" onClick={findOnMap} disabled={!f.location.trim() || finding}>
                <MapPin /> {t("official.findOnMap")}
              </Button>
            </div>
          </Field>
          <LocationPicker value={pos} onChange={setPos} className="h-64" />
        </div>
        <SheetFooter>
          <Button onClick={submit} disabled={!valid || busy}>
            {t("official.create")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
