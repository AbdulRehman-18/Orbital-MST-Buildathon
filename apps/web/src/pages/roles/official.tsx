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
  Landmark,
  ListPlus,
  Lock,
  Plus,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { keccak256, toBytes, zeroHash } from "viem";
import { Link } from "wouter";
import { Amount, EmptyState, Field, LoadingRows, PageHeader, ProgressBar, StatCard } from "@/components/common/bits";
import { MilestoneTimeline } from "@/components/common/chain-content";
import { LocationPicker } from "@/components/common/project-map";
import { RoleGate } from "@/components/common/role-gate";
import { StatusBadge } from "@/components/common/status-badge";
import { ActionDialog } from "@/components/dashboard/action-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useApi, useMode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ALL_WARDS, network } from "@/lib/chain";
import { formatAmount, percent, toChainAmount } from "@/lib/format";
import { useChainTx } from "@/lib/tx";
import { wardName } from "@/lib/wards";

const CATEGORIES: ProjectCategory[] = ["ROAD", "DRAINAGE", "WATER_SUPPLY", "STREET_LIGHTING", "PARK", "BUILDING", "OTHER"];
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
  const projects = useApi(["/api/projects", { official: me }], () => listProjects({ official: me, limit: 200 }));
  const milestones = useApi(["/api/milestones", { official: me }], () => listMilestones({ official: me }));
  const tenders = useApi(["/api/tenders"], () => listTenders());
  const [creating, setCreating] = useState(false);

  const items = projects.data?.items ?? [];
  const ms = milestones.data ?? [];
  const toRelease = ms.filter((m) => m.status === "APPROVED");
  const spent = items.reduce((n, p) => n + BigInt(p.spent), 0n);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        icon={Landmark}
        title={t("official.title")}
        subtitle={t("official.subtitle")}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t("official.newProject")}
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("official.kpiProjects")} value={items.length} icon={Building2} tone="primary" loading={projects.isLoading} />
        <StatCard label={t("official.kpiPending")} value={items.filter((p) => p.status === "PENDING_APPROVAL").length} icon={Hourglass} tone="warning" loading={projects.isLoading} />
        <StatCard label={t("official.kpiToRelease")} value={toRelease.length} icon={BadgeIndianRupee} tone="civic" loading={milestones.isLoading} />
        <StatCard label={t("official.kpiSpent")} value={<Amount value={spent} compact />} icon={Wallet} tone="success" loading={projects.isLoading} />
      </div>

      {user!.wards.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {t("official.wardsYouManage")}:{" "}
          <span className="text-foreground font-medium">{user!.wards.includes(ALL_WARDS) ? t("common.allWards") : user!.wards.join(", ")}</span>
        </p>
      )}

      {toRelease.length > 0 && (
        <Card className="border-teal-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCheck className="size-5 text-teal-600" /> {t("official.toRelease")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {toRelease.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.title}</p>
                  <Link href={`/projects/${m.projectId}`} className="text-muted-foreground text-xs hover:underline">
                    {m.project.title}
                  </Link>
                </div>
                <Amount value={m.amount} className="font-semibold" />
                <ReleaseButton m={m} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("official.myProjects")}</h2>
        {projects.isLoading ? (
          <LoadingRows rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={t("official.noProjects")}
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus /> {t("official.newProject")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((p) => (
              <OfficialProjectCard
                key={p.id}
                p={p}
                milestones={ms.filter((m) => m.projectId === p.id)}
                hasOpenTender={(tenders.data ?? []).some((tn) => tn.projectId === p.id && tn.status === "OPEN")}
              />
            ))}
          </div>
        )}
      </section>

      <CreateProjectSheet open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function OfficialProjectCard({ p, milestones, hasOpenTender }: { p: Project; milestones: MilestoneWithProject[]; hasOpenTender: boolean }) {
  const { t } = useTranslation();
  const active = p.status === "ACTIVE";
  const openAllocated = milestones
    .filter((m) => ["PENDING", "PROOF_SUBMITTED", "APPROVED", "REJECTED"].includes(m.status))
    .reduce((n, m) => n + BigInt(m.amount), 0n);
  const available = BigInt(p.funded) - BigInt(p.spent) - openAllocated;
  const unsettled = milestones.some((m) => m.status !== "PAID" && m.status !== "VOID");

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          <span className="text-muted-foreground text-xs">
            #{p.id} · {t("common.ward")} {p.wardId} · {t(`categories.${p.category}`)}
          </span>
        </div>
        <CardTitle className="text-lg">
          <Link href={`/projects/${p.id}`} className="hover:underline">
            {p.title ?? `#${p.id}`}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <Metric label={t("common.budget")} value={<Amount value={p.budget} compact />} />
          <Metric label={t("common.funded")} value={<Amount value={p.funded} compact />} />
          <Metric label={t("common.spent")} value={<Amount value={p.spent} compact />} />
          <Metric label={t("official.available", { amount: "" }).replace(/[:：]\s*$/, "")} value={<Amount value={available > 0n ? available : 0n} compact />} />
        </div>
        <div className="flex flex-col gap-1">
          <ProgressBar value={percent(p.spent, p.budget)} />
          <p className="text-muted-foreground text-xs">{t("projects.budgetUsed", { pct: percent(p.spent, p.budget) })}</p>
        </div>
        {p.status === "PENDING_APPROVAL" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">{t("projects.approvalsOf", { count: p.approvalCount, total: p.approvalThreshold })}</p>
        )}
        {milestones.length > 0 && (
          <MilestoneTimeline
            milestones={milestones}
            threshold={p.approvalThreshold}
            actions={(m) => (m.status === "APPROVED" ? <ReleaseButton m={m as MilestoneWithProject} /> : null)}
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
  const valid = value !== null && value > 0n && value <= remaining && (mode === "ESCROW" || ref.trim().length > 3);

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
            ? { label: t("official.fund"), contract: "MilestoneEscrow", functionName: "fundProject", args: [BigInt(p.id)], value: value!, kind: "fundProject", entityId: p.id }
            : { label: t("official.fund"), contract: "MilestoneEscrow", functionName: "recordSanction", args: [BigInt(p.id), value!, refHash(ref)], kind: "recordSanction", entityId: p.id },
        ))
      }
    >
      <p className="text-muted-foreground text-sm">{t("official.remaining", { amount: formatAmount(remaining, mode) })}</p>
      <Field label={mode === "ESCROW" ? t("official.budgetCoins", { symbol: network.nativeCurrency.symbol }) : t("official.budgetRupees")}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === "ESCROW" ? "1.5" : "10,00,000"} />
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
        const meta = await pinMetadata({ kind: "milestone", title: title.trim(), description: description.trim() || undefined, projectId: p.id });
        const hash = await send({
          label: t("official.addMilestone"),
          contract: "MilestoneEscrow",
          functionName: "createMilestone",
          args: [BigInt(p.id), meta.hash, meta.cid, value!],
          kind: "createMilestone",
          entityId: p.id,
        });
        if (hash) setTitle(""), setDescription(""), setAmount("");
        return !!hash;
      }}
    >
      <p className="text-muted-foreground text-sm">{t("official.available", { amount: formatAmount(available > 0n ? available : 0n, mode) })}</p>
      <Field label={t("common.title")}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bituminous concrete wearing course" />
      </Field>
      <Field label={`${t("common.description")} (${t("common.optional")})`}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </Field>
      <Field label={mode === "ESCROW" ? t("official.budgetCoins", { symbol: network.nativeCurrency.symbol }) : `${t("common.amount")} (₹)`}>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,00,000" />
      </Field>
    </ActionDialog>
  );
}

function ReleaseButton({ m }: { m: MilestoneWithProject | { id: number; projectId: number; amount: string } }) {
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
          <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="SBIN0000123456789" className="font-mono" />
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
        const meta = await pinMetadata({ kind: "tender", title: `Tender — ${p.title ?? p.id}`, description: notes, projectId: p.id });
        const now = Math.floor(Date.now() / 1000);
        const commit = now + Number(commitDays) * 86400;
        return !!(await send({
          label: t("official.publishTender"),
          contract: "TenderRegistry",
          functionName: "publishTender",
          args: [BigInt(p.id), meta.cid, BigInt(commit), BigInt(commit + Number(revealDays) * 86400)],
          kind: "publishTender",
          entityId: p.id,
        }));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("official.commitDays")}>
          <Input type="number" min={1} value={commitDays} onChange={(e) => setCommitDays(e.target.value)} />
        </Field>
        <Field label={t("official.revealDays")}>
          <Input type="number" min={1} value={revealDays} onChange={(e) => setRevealDays(e.target.value)} />
        </Field>
      </div>
      <Field label={t("common.description")}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </Field>
    </ActionDialog>
  );
}

function AssignContractorButton({ p }: { p: Project }) {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const holders = useApi(["/api/roles"], () => listRoleHolders());
  const contractors = (holders.data ?? []).filter((h) => h.roles.includes("CONTRACTOR"));
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
          <SelectTrigger className="w-full font-mono">
            <SelectValue placeholder="0x…" />
          </SelectTrigger>
          <SelectContent>
            {contractors.map((c) => (
              <SelectItem key={c.address} value={c.address} className="font-mono">
                {c.address}
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
        !!(await send({ label: t("official.close"), contract: "ProjectRegistry", functionName: "closeProject", args: [BigInt(p.id)], kind: "closeProject", entityId: p.id }))
      }
    />
  );
}

function CreateProjectSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const mode = useMode();
  const { send } = useChainTx();
  const wards = useApi(["/api/wards"], () => listWards());
  const departments = useApi(["/api/departments"], () => listDepartments());
  const holders = useApi(["/api/roles"], () => listRoleHolders());
  const contractors = (holders.data ?? []).filter((h) => h.roles.includes("CONTRACTOR"));
  const allowed = (wards.data ?? []).filter((w) => user!.wards.includes(ALL_WARDS) || user!.wards.includes(w.id) || user!.wards.length === 0);

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
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  let budget: bigint | null = null;
  try {
    budget = f.budget ? toChainAmount(f.budget, mode) : null;
  } catch {
    budget = null;
  }
  const valid = f.title.trim().length >= 3 && f.description.trim().length >= 3 && f.wardId && pos && budget && budget > 0n && f.endDate > f.startDate;

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
            <Input value={f.title} onChange={(e) => set("title")(e.target.value)} placeholder="Koramangala 6th Block footpath upgrade" />
          </Field>
          <Field label={t("common.description")}>
            <Textarea value={f.description} onChange={(e) => set("description")(e.target.value)} rows={3} />
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
            <Field label={mode === "ESCROW" ? t("official.budgetCoins", { symbol: network.nativeCurrency.symbol }) : t("official.budgetRupees")}>
              <Input inputMode="decimal" value={f.budget} onChange={(e) => set("budget")(e.target.value)} placeholder="25,00,000" />
            </Field>
            <Field label={t("common.start")}>
              <Input type="date" value={f.startDate} onChange={(e) => set("startDate")(e.target.value)} />
            </Field>
            <Field label={t("common.end")}>
              <Input type="date" value={f.endDate} onChange={(e) => set("endDate")(e.target.value)} />
            </Field>
            <Field label={t("common.contractor")}>
              <Select value={f.contractor} onValueChange={set("contractor")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("official.assignLater")}</SelectItem>
                  {contractors.map((c) => (
                    <SelectItem key={c.address} value={c.address} className="font-mono">
                      {c.address.slice(0, 10)}…{c.address.slice(-6)}
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
          <Field label={t("common.location")} hint={pos ? `${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}` : t("official.pickLocation")}>
            <Input value={f.location} onChange={(e) => set("location")(e.target.value)} placeholder="6th Block, Koramangala" />
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
