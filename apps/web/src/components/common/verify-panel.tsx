import { verifyProject, type VerifyResult } from "@namma-seva/api-client";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage, useMode } from "@/lib/api";
import { formatAmount, shortAddress } from "@/lib/format";
import { useNameOf } from "@/lib/names";

const AMOUNT_FIELDS = new Set(["budget", "spent"]);
const ADDRESS_FIELDS = new Set(["official", "contractor", "metaHash"]);

export function VerifyResultView({ result }: { result: VerifyResult }) {
  const { t } = useTranslation();
  const mode = useMode();
  const nameOf = useNameOf();
  const show =(field: string, v: string | null) => {
    if (v === null) return "—";
    if (AMOUNT_FIELDS.has(field)) return formatAmount(v, mode);
    if (field === "status") return t(`status.${v}`, { defaultValue: v });
    if (ADDRESS_FIELDS.has(field)) {
      // Names for people/firms; the address (what the chain actually compares) stays visible.
      const named = field === "metaHash" ? undefined : nameOf(v);
      return (
        <span className="inline-flex flex-col">
          {named && <span className="font-medium">{named.name}</span>}
          <span className="font-mono text-xs" title={v}>
            {shortAddress(v)}
          </span>
        </span>
      );
    }
    return v;
  };
  return (
    <div className="flex flex-col gap-4">
      <Alert variant={result.verified ? "default" : "destructive"} className={result.verified ? "border-emerald-500/40 bg-emerald-500/5" : ""}>
        {result.verified ? <ShieldCheck className="text-emerald-600" /> : <ShieldAlert />}
        <AlertTitle>{result.verified ? t("verify.verified") : t("verify.mismatch")}</AlertTitle>
        <AlertDescription>
          {result.metadataVerified === true && t("verify.metadataOk")}
          {result.metadataVerified === false && t("verify.metadataBad")}
          {result.metadataVerified === null && t("verify.metadataUnknown")} {t("verify.checkedAt", { block: result.block })}
        </AlertDescription>
      </Alert>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("verify.field")}</TableHead>
              <TableHead>{t("verify.ourRecord")}</TableHead>
              <TableHead>{t("verify.onChain")}</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.fields.map((f) => (
              <TableRow key={f.field}>
                <TableCell className="font-medium">{f.field}</TableCell>
                <TableCell>{show(f.field, f.indexed)}</TableCell>
                <TableCell>{show(f.field, f.onChain)}</TableCell>
                <TableCell>{f.match ? <BadgeCheck className="size-4 text-emerald-600" /> : <ShieldAlert className="text-destructive size-4" />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** "Verify on chain" button + inline result (project page). */
export function VerifyButton({ projectId }: { projectId: number }) {
  const { t } = useTranslation();
  const m = useMutation({ mutationFn: () => verifyProject(projectId) });
  return (
    <div className="flex flex-col gap-3">
      <Button variant={m.data ? "outline" : "default"} onClick={() => m.mutate()} disabled={m.isPending} className="w-fit">
        {m.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {t("verify.verifyOnChain")}
      </Button>
      {m.error && <p className="text-destructive text-sm">{errorMessage(m.error)}</p>}
      {m.data && <VerifyResultView result={m.data} />}
    </div>
  );
}
