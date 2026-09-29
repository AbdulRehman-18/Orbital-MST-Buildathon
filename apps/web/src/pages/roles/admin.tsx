import { getListProfilesQueryKey, getReady, listRoleHolders, setProfile, type ReadyCheck } from "@namma-seva/api-client";
import { toast } from "sonner";
import { queryClient } from "@/lib/api";
import { useNameOf } from "@/lib/names";
import {
  Activity,
  CheckCircle2,
  Database,
  Fuel,
  KeyRound,
  Pencil,
  LayoutDashboard,
  Server,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { keccak256, toBytes, zeroHash } from "viem";
import { AddressLink, Field, StatCard } from "@/components/common/bits";
import { ROLE_VISUAL, ToneIcon } from "@/components/common/tone";
import { RolePanel, usePanelTab } from "@/components/layout/role-panel";
import { TabsContent } from "@/components/ui/tabs";
import { RoleGate } from "@/components/common/role-gate";
import { ActionDialog } from "@/components/dashboard/action-dialog";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi, useChainStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ALL_WARDS } from "@/lib/chain";
import { useChainTx } from "@/lib/tx";
import { cn } from "@/lib/utils";

const GRANTABLE = ["GOVT_OFFICIAL", "AUDITOR", "CONTRACTOR", "RELAYER", "PAUSER"] as const;
const roleId = (role: string) => (role === "ADMIN" ? zeroHash : keccak256(toBytes(role)));

export default function AdminDashboard() {
  return (
    <RoleGate role="ADMIN">
      <Admin />
    </RoleGate>
  );
}

function Check({
  label,
  check,
  icon: Icon,
}: {
  label: string;
  check?: ReadyCheck;
  icon: typeof Database;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <ToneIcon icon={Icon} tone="slate" size="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground truncate text-xs">
          {check ? (check.detail ?? "OK") : "…"}
        </p>
      </div>
      {check &&
        (check.ok ? (
          <CheckCircle2 className="tone-green size-5 text-(--tone-fg)" />
        ) : (
          <XCircle className="text-destructive size-5" />
        ))}
    </div>
  );
}

function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const status = useChainStatus();
  const ready = useApi(
    ["/api/ready"],
    () => getReady().catch((e) => (e?.data as Awaited<ReturnType<typeof getReady>>) ?? null),
    { refetchInterval: 10_000 },
  );
  const holders = useApi(["/api/roles"], () => listRoleHolders());
  const { send } = useChainTx();
  const s = status.data;
  const [tab, go] = usePanelTab("/admin", ["overview", "roles"]);

  return (
    <RolePanel
      tab={tab}
      onTab={go}
      badge={
        <ToneIcon icon={ROLE_VISUAL.ADMIN.icon} tone="violet" className="size-14 rounded-2xl" />
      }
      title={t("admin.title")}
      subtitle={t("admin.subtitle")}
      action={<GrantDialog />}
      tabs={[
        {
          value: "overview",
          label: t("citizen.tabOverview"),
          icon: LayoutDashboard,
          tone: "slate",
        },
        {
          value: "roles",
          label: t("admin.roles"),
          icon: KeyRound,
          tone: "violet",
          count: holders.data?.length ?? 0,
        },
      ]}
    >
      <TabsContent value="overview" className="flex flex-col gap-6">
        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border lg:grid-cols-4">
          <StatCard
            label={t("network.head")}
            value={s?.headBlock ?? "—"}
            icon={Activity}
            tone="primary"
            loading={status.isLoading}
          />
          <StatCard
            label={t("network.indexed")}
            value={s?.indexedBlock ?? "—"}
            hint={
              s?.lagBlocks !== null && s?.lagBlocks !== undefined
                ? t("network.lag", { n: s.lagBlocks })
                : undefined
            }
            icon={Server}
            tone="civic"
            loading={status.isLoading}
          />
          <StatCard
            label={t("admin.relayer")}
            value={s?.relayer ? `${Number(s.relayer.balance).toFixed(2)}` : "—"}
            hint={
              s?.relayer
                ? `${t("admin.spentToday")} ${Number(s.relayer.spentToday).toFixed(4)} / ${s.relayer.dailyCap}`
                : undefined
            }
            icon={Fuel}
            tone={s?.relayer?.low ? "warning" : "success"}
            loading={status.isLoading}
          />
          <StatCard
            label={t("admin.roles")}
            value={holders.data?.length ?? 0}
            icon={KeyRound}
            tone="default"
            loading={holders.isLoading}
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.health")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Check
                label={t("admin.database")}
                check={ready.data?.checks.database}
                icon={Database}
              />
              <Check label={t("admin.rpc")} check={ready.data?.checks.rpc} icon={Server} />
              <Check
                label={t("admin.indexer")}
                check={ready.data?.checks.indexer}
                icon={Activity}
              />
              {s?.relayer?.low && (
                <p className="tone-amber text-sm text-(--tone-fg)">{t("admin.low")}</p>
              )}
              <div className="text-muted-foreground flex flex-wrap gap-x-4 pt-2 text-xs">
                <span>
                  {t("admin.mode")}: <Badge variant="outline">{s?.mode ?? "—"}</Badge>
                </span>
                <span>
                  {t("admin.confirmations")}: {s?.confirmations ?? "—"}
                </span>
                <span>chain {s?.chainId}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.contracts")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {Object.entries(s?.contracts ?? {}).map(([name, addr]) => (
                <div key={name} className="flex items-center justify-between gap-2">
                  <span className="font-medium">{name}</span>
                  <AddressLink address={addr} />
                </div>
              ))}
              {s?.relayer && (
                <div className="flex items-center justify-between gap-2 border-t pt-2">
                  <span className="font-medium">{t("admin.relayer")}</span>
                  <AddressLink address={s.relayer.address} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="roles">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.roles")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.address")}</TableHead>
                  <TableHead>{t("common.role")}</TableHead>
                  <TableHead>{t("common.wards")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(holders.data ?? []).map((h) => (
                  <TableRow key={h.address}>
                    <TableCell>
                      <AddressLink address={h.address} you={h.address === user?.walletAddress} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {h.roles.map((r) => (
                          <Badge key={r} variant="secondary">
                            {t(`roles.${r}`, { defaultValue: r })}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {h.allWards ? t("common.allWards") : h.wards.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <NameButton address={h.address} />
                      {h.roles
                        .filter((r) => r !== "ADMIN" && h.address !== user?.walletAddress)
                        .map((r) => (
                          <Button
                            key={r}
                            size="sm"
                            variant="ghost"
                            className={cn("text-destructive")}
                            onClick={() =>
                              void send({
                                label: `${t("admin.revoke")} ${r}`,
                                contract: "NammaSevaAccess",
                                functionName: "revokeRole",
                                args: [roleId(r), h.address],
                                kind: "revokeRole",
                                entityId: h.address,
                              })
                            }
                          >
                            <UserMinus /> {r}
                          </Button>
                        ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </RolePanel>
  );
}

/** Save a wallet's public display name (admin only), then refresh every name on screen. */
async function saveName(address: string, name: string, title: string) {
  await setProfile(address, { name: name.trim(), title: title.trim() || null });
  await queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
}

function NameButton({ address }: { address: string }) {
  const { t } = useTranslation();
  const current = useNameOf()(address);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  return (
    <ActionDialog
      trigger={(open) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setName(current?.name ?? "");
            setTitle(current?.title ?? "");
            open();
          }}
        >
          <Pencil /> {t("admin.setName")}
        </Button>
      )}
      title={t("admin.nameTitle")}
      description={t("admin.nameBody")}
      submitLabel={t("common.save")}
      disabled={name.trim().length < 2}
      onSubmit={async () => {
        await saveName(address, name, title);
        toast.success(t("admin.nameSaved"));
        return true;
      }}
    >
      <p className="text-muted-foreground font-mono text-xs break-all">{address}</p>
      <Field label={t("admin.nameLabel")}>
        <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Sri Ganesh Constructions" />
      </Field>
      <Field label={t("admin.titleLabel")}>
        <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Class-I civil contractor" />
      </Field>
    </ActionDialog>
  );
}

function GrantDialog() {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<string>("GOVT_OFFICIAL");
  const [wards, setWards] = useState("");
  const [all, setAll] = useState(false);
  const [name, setName] = useState("");
  const wardIds = wards
    .split(",")
    .map((w) => Number(w.trim()))
    .filter((w) => Number.isInteger(w) && w >= 0);

  return (
    <ActionDialog
      trigger={(open) => (
        <Button onClick={open}>
          <UserPlus /> {t("admin.grant")}
        </Button>
      )}
      title={t("admin.grantTitle")}
      description={t("admin.grantBody")}
      submitLabel={t("admin.grant")}
      disabled={!/^0x[0-9a-fA-F]{40}$/.test(address)}
      onSubmit={async () => {
        const ok = await send({
          label: `${t("admin.grant")} ${role}`,
          contract: "NammaSevaAccess",
          functionName: "grantRole",
          args: [roleId(role), address],
          kind: "grantRole",
          entityId: address,
        });
        if (!ok) return false;
        if (name.trim().length >= 2) await saveName(address, name, "");
        const scope = all ? [ALL_WARDS] : wardIds;
        if (scope.length) {
          await send({
            label: t("common.wards"),
            contract: "NammaSevaAccess",
            functionName: "setWardAccessBatch",
            args: [address, scope, true],
            kind: "setWardAccess",
            entityId: address,
          });
        }
        return true;
      }}
    >
      <Field label={t("common.address")}>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          placeholder="0x…"
          className="font-mono"
        />
      </Field>
      <Field label={t("admin.nameLabel")} hint={t("admin.nameHint")}>
        <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Sri Ganesh Constructions" />
      </Field>
      <Field label={t("common.role")}>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRANTABLE.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`roles.${r}`, { defaultValue: r })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t("common.wards")} hint={t("admin.wardsHint")}>
        <Input
          value={wards}
          onChange={(e) => setWards(e.target.value)}
          placeholder="150, 151"
          disabled={all}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />
        {t("admin.allWardsLabel")}
      </label>
    </ActionDialog>
  );
}
