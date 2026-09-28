import { getReady, listRoleHolders, type ReadyCheck } from "@namma-seva/api-client";
import { Activity, CheckCircle2, Database, Fuel, KeyRound, Server, Settings, UserMinus, UserPlus, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { keccak256, toBytes, zeroHash } from "viem";
import { AddressLink, Field, PageHeader, StatCard } from "@/components/common/bits";
import { RoleGate } from "@/components/common/role-gate";
import { ActionDialog } from "@/components/dashboard/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function Check({ label, check, icon: Icon }: { label: string; check?: ReadyCheck; icon: typeof Database }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Icon className="text-muted-foreground mt-0.5 size-5" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground truncate text-xs">{check ? (check.detail ?? "OK") : "…"}</p>
      </div>
      {check && (check.ok ? <CheckCircle2 className="size-5 text-emerald-600" /> : <XCircle className="text-destructive size-5" />)}
    </div>
  );
}

function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const status = useChainStatus();
  const ready = useApi(["/api/ready"], () => getReady().catch((e) => (e?.data as Awaited<ReturnType<typeof getReady>>) ?? null), { refetchInterval: 10_000 });
  const holders = useApi(["/api/roles"], () => listRoleHolders());
  const { send } = useChainTx();
  const s = status.data;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader icon={Settings} title={t("admin.title")} subtitle={t("admin.subtitle")} actions={<GrantDialog />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("network.head")} value={s?.headBlock ?? "—"} icon={Activity} tone="primary" loading={status.isLoading} />
        <StatCard
          label={t("network.indexed")}
          value={s?.indexedBlock ?? "—"}
          hint={s?.lagBlocks !== null && s?.lagBlocks !== undefined ? t("network.lag", { n: s.lagBlocks }) : undefined}
          icon={Server}
          tone="civic"
          loading={status.isLoading}
        />
        <StatCard
          label={t("admin.relayer")}
          value={s?.relayer ? `${Number(s.relayer.balance).toFixed(2)}` : "—"}
          hint={s?.relayer ? `${t("admin.spentToday")} ${Number(s.relayer.spentToday).toFixed(4)} / ${s.relayer.dailyCap}` : undefined}
          icon={Fuel}
          tone={s?.relayer?.low ? "warning" : "success"}
          loading={status.isLoading}
        />
        <StatCard label={t("admin.roles")} value={holders.data?.length ?? 0} icon={KeyRound} tone="default" loading={holders.isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.health")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Check label={t("admin.database")} check={ready.data?.checks.database} icon={Database} />
            <Check label={t("admin.rpc")} check={ready.data?.checks.rpc} icon={Server} />
            <Check label={t("admin.indexer")} check={ready.data?.checks.indexer} icon={Activity} />
            {s?.relayer?.low && <p className="text-sm text-amber-600">{t("admin.low")}</p>}
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
                  <TableCell className="text-xs">{h.allWards ? t("common.allWards") : h.wards.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right">
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
    </div>
  );
}

function GrantDialog() {
  const { t } = useTranslation();
  const { send } = useChainTx();
  const [address, setAddress] = useState("");
  const [role, setRole] = useState<string>("GOVT_OFFICIAL");
  const [wards, setWards] = useState("");
  const [all, setAll] = useState(false);
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
        <Input value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="0x…" className="font-mono" />
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
        <Input value={wards} onChange={(e) => setWards(e.target.value)} placeholder="150, 151" disabled={all} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary size-4" checked={all} onChange={(e) => setAll(e.target.checked)} />
        {t("admin.allWardsLabel")}
      </label>
    </ActionDialog>
  );
}
