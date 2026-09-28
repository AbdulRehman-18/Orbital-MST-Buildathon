import { listLedgerEvents, verifyProject, type ChainEvent, type VerifyResult } from "@namma-seva/api-client";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "wouter";
import { EmptyState, PageHeader } from "@/components/common/bits";
import { VerifyResultView } from "@/components/common/verify-panel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { EventsTable } from "./project-detail";

type Outcome = { kind: "project"; result: VerifyResult } | { kind: "tx"; events: ChainEvent[] };

export default function VerifyPage() {
  const { t } = useTranslation();
  const search = useSearch();
  const [input, setInput] = useState(new URLSearchParams(search).get("q") ?? "");

  const m = useMutation<Outcome, Error, string>({
    mutationFn: async (value) => {
      const v = value.trim();
      if (/^0x[0-9a-fA-F]{64}$/.test(v)) {
        const page = await listLedgerEvents({ txHash: v, includePending: true });
        return { kind: "tx", events: page.items };
      }
      const id = Number(v.replace(/^#/, ""));
      if (!Number.isInteger(id) || id <= 0) throw new Error(t("verify.inputPlaceholder"));
      return { kind: "project", result: await verifyProject(id) };
    },
  });

  useEffect(() => {
    if (input) m.mutate(input);
  }, []);

  const txProject =
    m.data?.kind === "tx"
      ? (m.data.events.map((e) => e.args.projectId).find((v): v is string => typeof v === "string") ?? null)
      : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title={t("verify.title")} subtitle={t("verify.subtitle")} icon={ShieldCheck} />
      <Card>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate(input);
            }}
          >
            <label htmlFor="verify-input" className="sr-only">
              {t("verify.inputLabel")}
            </label>
            <Input
              id="verify-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("verify.inputPlaceholder")}
              className="h-11 font-mono"
            />
            <Button type="submit" size="lg" disabled={m.isPending || !input.trim()}>
              {m.isPending ? <Loader2 className="animate-spin" /> : <Search />} {t("verify.check")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {m.error && <p className="text-destructive text-sm">{errorMessage(m.error)}</p>}
      {m.data?.kind === "project" && (
        <div className="flex flex-col gap-3">
          <Link href={`/projects/${m.data.result.projectId}`} className="text-primary w-fit font-medium hover:underline">
            {t("common.project")} #{m.data.result.projectId} →
          </Link>
          <VerifyResultView result={m.data.result} />
        </div>
      )}
      {m.data?.kind === "tx" &&
        (m.data.events.length === 0 ? (
          <EmptyState title={t("verify.txNotFound")} />
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold">{t("verify.txEvents")}</h2>
            <EventsTable events={m.data.events} />
            {txProject && (
              <Button variant="outline" className="w-fit" onClick={() => (setInput(String(txProject)), m.mutate(String(txProject)))}>
                <ShieldCheck /> {t("verify.verifyOnChain")} · #{String(txProject)}
              </Button>
            )}
          </div>
        ))}

      <Accordion type="single" collapsible>
        <AccordionItem value="how">
          <AccordionTrigger>{t("verify.howTitle")}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{t("verify.howBody")}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
