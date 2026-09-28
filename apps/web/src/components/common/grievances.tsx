import {
  fileGrievance,
  getRelayJob,
  upvoteGrievance,
  type Grievance,
  type GrievanceCategory,
  type Project,
} from "@namma-seva/api-client";
import { MegaphoneIcon, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, queryClient } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { Field } from "./bits";
import { IpfsText } from "./chain-content";
import { StatusBadge } from "./status-badge";

const CATEGORIES: GrievanceCategory[] = ["QUALITY", "DELAY", "SAFETY", "MISSING_WORK", "CORRUPTION", "OTHER"];

/** Poll a relay job until it is on-chain (or failed), with toasts. */
async function followRelayJob(jobId: string, t: (k: string, o?: Record<string, unknown>) => string, successKey: string) {
  const id = toast.loading(t("citizen.queued"));
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const job = await getRelayJob(jobId).catch(() => null);
    if (job?.status === "confirmed") {
      toast.success(t(successKey), { id, description: t("tx.indexing") });
      for (const d of [1500, 5000]) setTimeout(() => void queryClient.invalidateQueries(), d);
      return;
    }
    if (job?.status === "failed") {
      toast.error(t("citizen.relayFailed", { reason: job.error ?? "" }), { id });
      return;
    }
  }
  toast.dismiss(id);
}

export function GrievanceCard({ g, showProject, projectTitle }: { g: Grievance; showProject?: boolean; projectTitle?: string | null }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const canUpvote = user?.role === "CITIZEN" && !user.demo && !g.mine && !g.upvotedByMe && g.status !== "RESPONDED";

  async function upvote() {
    setBusy(true);
    try {
      const job = await upvoteGrievance(g.id);
      void followRelayJob(job.jobId, t, "citizen.upvoteQueued");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={g.status} />
          <span className="bg-muted rounded px-1.5 py-0.5 text-xs">{t(`grievanceCategories.${g.category}`)}</span>
          {g.mine && <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-semibold">{t("projects.mine")}</span>}
          <span className="text-muted-foreground ml-auto text-xs">{relativeTime(g.createdAt, i18n.language)}</span>
        </div>
        {showProject && (
          <Link href={`/projects/${g.projectId}`} className="text-primary text-sm font-medium hover:underline">
            {projectTitle ?? `${t("common.project")} #${g.projectId}`}
          </Link>
        )}
        <IpfsText cid={g.cid} />
        {g.status === "ESCALATED" && g.respondBy && (
          <p className="text-xs text-red-600">{t("projects.respondBy", { when: formatDate(g.respondBy, i18n.language) })}</p>
        )}
        {g.responseCid && (
          <div className="bg-muted/60 rounded-md border-l-4 border-emerald-500 px-3 py-2">
            <p className="text-muted-foreground mb-1 text-xs font-semibold">
              {t("projects.response")} · {g.action === "PAUSE_PROJECT" ? t("auditor.actionPause") : t("auditor.actionDismiss")}
            </p>
            <IpfsText cid={g.responseCid} field="title" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
            <ThumbsUp className="size-4" /> {t("citizen.upvotes", { count: g.upvotes })}
          </span>
          {canUpvote && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={upvote} disabled={busy}>
              <ThumbsUp /> {t("projects.upvote")}
            </Button>
          )}
          {g.upvotedByMe && <span className="text-primary ml-auto text-xs font-medium">{t("projects.upvoted")} ✓</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export function FileGrievanceDialog({
  projects,
  defaultProjectId,
  trigger,
}: {
  projects: Pick<Project, "id" | "title" | "status">[];
  defaultProjectId?: number;
  trigger?: (open: () => void) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>(defaultProjectId ? String(defaultProjectId) : "");
  const [category, setCategory] = useState<GrievanceCategory>("QUALITY");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = projects.filter((p) => p.status !== "CANCELLED");

  if (user?.role !== "CITIZEN") return null;

  async function submit() {
    setBusy(true);
    try {
      const job = await fileGrievance({ projectId: Number(projectId), category, text: text.trim(), lang: "en" });
      setOpen(false);
      setText("");
      void followRelayJob(job.jobId, t, "citizen.submitted");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button onClick={() => setOpen(true)}>
          <MegaphoneIcon /> {t("projects.fileGrievance")}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("citizen.fileTitle")}</DialogTitle>
            <DialogDescription>{t("citizen.fileBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label={t("citizen.chooseProject")}>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("citizen.chooseProject")} />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      #{p.id} · {p.title ?? t("common.project")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("citizen.whatsWrong")}>
              <Select value={category} onValueChange={(v) => setCategory(v as GrievanceCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`grievanceCategories.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("citizen.describe")} hint={`${text.trim().length}/2000`}>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 2000))}
                placeholder={t("citizen.describePlaceholder")}
                rows={4}
              />
            </Field>
            <p className="text-muted-foreground text-xs">{t("citizen.gasless")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={busy || !projectId || text.trim().length < 10}>
              {busy ? t("citizen.submitting") : t("common.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
