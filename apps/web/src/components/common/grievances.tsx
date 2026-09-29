import {
  fileGrievance,
  getRelayJob,
  upvoteGrievance,
  type Grievance,
  type GrievanceCategory,
  type Project,
} from "@namma-seva/api-client";
import { Camera, Check, Images, Loader2, MapPin, MegaphoneIcon, ThumbsUp, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, queryClient, uploadForm } from "@/lib/api";
import { ipfsUrl } from "@/lib/chain";
import { useAuth } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/format";
import { Field } from "./bits";
import { IpfsText, useIpfsJson } from "./chain-content";
import { StatusBadge } from "./status-badge";
import { GRIEVANCE_VISUAL, ToneIcon } from "./tone";
import { cn } from "@/lib/utils";

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
  const visual = GRIEVANCE_VISUAL[g.category] ?? GRIEVANCE_VISUAL.OTHER;

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
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <ToneIcon icon={visual.icon} tone={visual.tone} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="font-medium">{t(`grievanceCategories.${g.category}`)}</p>
            {showProject && (
              <Link href={`/projects/${g.projectId}`} className="text-muted-foreground hover:text-foreground truncate text-sm underline-offset-4 hover:underline">
                {projectTitle ?? `${t("common.project")} #${g.projectId}`}
              </Link>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge status={g.status} />
            <span className="text-muted-foreground text-xs">{relativeTime(g.createdAt, i18n.language)}</span>
          </div>
        </div>
        <IpfsText cid={g.cid} />
        <GrievancePhotos cid={g.cid} />
        <StatusTrail g={g} />
        {g.status === "ESCALATED" && g.respondBy && (
          <p className="text-destructive text-sm">{t("projects.respondBy", { when: formatDate(g.respondBy, i18n.language) })}</p>
        )}
        {g.responseCid && (
          <div className="tone tone-green rounded-xl px-4 py-3">
            <p className="mb-1 text-xs font-medium">
              {t("projects.response")}: {g.action === "PAUSE_PROJECT" ? t("auditor.actionPause") : t("auditor.actionDismiss")}
            </p>
            <IpfsText cid={g.responseCid} field="title" className="text-foreground" />
          </div>
        )}
      </div>
      <div className="bg-muted/40 flex min-h-12 items-center gap-2 border-t px-5 py-2.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          <ThumbsUp className="size-4" /> {t("citizen.upvotes", { count: g.upvotes })}
        </span>
        {g.mine && <span className="bg-background ml-auto rounded-full border px-2 py-0.5 text-xs font-medium">{t("projects.mine")}</span>}
        {canUpvote && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={upvote} disabled={busy}>
            <ThumbsUp /> {t("projects.upvote")}
          </Button>
        )}
        {g.upvotedByMe && <span className="ml-auto text-xs font-medium">{t("projects.upvoted")} ✓</span>}
      </div>
    </Card>
  );
}

/** Where a report stands: reported, sent to auditors, answered. Each done step shows its date. */
function StatusTrail({ g }: { g: Grievance }) {
  const { t, i18n } = useTranslation();
  const steps = [
    { label: t("citizen.trailReported"), at: g.createdAt },
    { label: t("citizen.trailAuditors"), at: g.escalatedAt },
    { label: t("citizen.trailAnswered"), at: g.status === "RESPONDED" ? (g.respondedAt ?? g.createdAt) : null },
  ];
  return (
    <ol className="grid grid-cols-3 gap-2">
      {steps.map((s) => (
        <li key={s.label} className="flex flex-col gap-1.5">
          <span className={cn("h-1 rounded-full", s.at ? "tone-green bg-(--tone-fg)" : "bg-muted")} aria-hidden="true" />
          <span className={cn("text-xs font-medium", !s.at && "text-muted-foreground")}>{s.label}</span>
          <span className="text-muted-foreground text-xs">{s.at ? formatDate(s.at, i18n.language) : "\u00a0"}</span>
        </li>
      ))}
    </ol>
  );
}

/** Public record for a citizen photo, pinned by the API (see POST /grievances/photos). */
type PhotoRecord = { image: string; thumb: string; distanceM: number | null; nearSite: boolean };

const distance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`);

function PhotoLocation({ distanceM, nearSite, className }: { distanceM: number | null; nearSite: boolean; className?: string }) {
  const { t } = useTranslation();
  if (distanceM === null) return null;
  return (
    <span className={cn("tone inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", nearSite ? "tone-green" : "tone-amber", className)}>
      {nearSite ? <Check className="size-3" /> : <MapPin className="size-3" />}
      {t("citizen.photoDistance", { distance: distance(distanceM) })}
    </span>
  );
}

function GrievancePhotos({ cid }: { cid: string }) {
  const q = useIpfsJson<{ photoCids?: string[] }>(cid);
  const photos = q.data?.photoCids ?? [];
  if (photos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((c) => (
        <PhotoThumb key={c} cid={c} />
      ))}
    </div>
  );
}

function PhotoThumb({ cid }: { cid: string }) {
  const { t } = useTranslation();
  const q = useIpfsJson<PhotoRecord>(cid);
  if (!q.data) return <span className="bg-muted size-28 animate-pulse rounded-xl" />;
  const r = q.data;
  return (
    <a href={ipfsUrl(r.image, { preferGateway: true })} target="_blank" rel="noreferrer" className="flex w-28 flex-col gap-1.5">
      <img src={ipfsUrl(r.thumb, { preferGateway: true })} alt={t("citizen.photos")} loading="lazy" className="size-28 rounded-xl border object-cover" />
      <PhotoLocation distanceM={r.distanceM} nearSite={r.nearSite} className="w-fit" />
    </a>
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
  const [photos, setPhotos] = useState<(PhotoRecord & { cid: string; preview: string })[]>([]);
  const [adding, setAdding] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const fix = useRef<Promise<GeolocationCoordinates | null> | null>(null);
  const eligible = projects.filter((p) => p.status !== "CANCELLED");

  // A camera shot rarely keeps GPS in the file, so the phone's location is read as the camera opens.
  // Gallery photos get no device location: they may be old or taken somewhere else.
  function openCamera() {
    fix.current = new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p.coords),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      );
    });
    camera.current?.click();
  }

  async function addPhotos(files: FileList | null, source: "camera" | "gallery") {
    if (!files?.length) return;
    setAdding(true);
    try {
      const coords = source === "camera" ? await fix.current : null;
      for (const file of Array.from(files).slice(0, 4 - photos.length)) {
        const form = new FormData();
        form.append("photo", file);
        form.append("projectId", projectId);
        form.append("source", source);
        if (coords) {
          form.append("latE6", String(Math.round(coords.latitude * 1e6)));
          form.append("lngE6", String(Math.round(coords.longitude * 1e6)));
        }
        const r = await uploadForm<PhotoRecord & { cid: string }>("/api/grievances/photos", form);
        setPhotos((ps) => [...ps, { ...r, preview: URL.createObjectURL(file) }]);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(false);
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  if (user?.role !== "CITIZEN") return null;

  async function submit() {
    setBusy(true);
    try {
      const job = await fileGrievance({ projectId: Number(projectId), category, text: text.trim(), lang: "en", photoCids: photos.map((p) => p.cid) });
      setOpen(false);
      setText("");
      setPhotos([]);
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
          <MegaphoneIcon /> {t("citizen.fileTitle")}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("citizen.fileTitle")}</DialogTitle>
            <DialogDescription>{t("citizen.fileBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label={t("citizen.chooseProject")}>
              <Select value={projectId} onValueChange={(v) => (setProjectId(v), setPhotos([]))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("citizen.chooseProject")} />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.title ?? `${t("common.project")} #${p.id}`}
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
            <Field label={t("citizen.photos")} hint={projectId ? t("citizen.photosHint") : t("citizen.projectFirst")}>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={openCamera} disabled={!projectId || adding || photos.length >= 4}>
                  <Camera className="tone-blue text-(--tone-fg)" /> {t("citizen.takePhoto")}
                </Button>
                <Button type="button" variant="outline" onClick={() => gallery.current?.click()} disabled={!projectId || adding || photos.length >= 4}>
                  <Images className="tone-violet text-(--tone-fg)" /> {t("citizen.choosePhoto")}
                </Button>
                <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void addPhotos(e.target.files, "camera")} />
                <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void addPhotos(e.target.files, "gallery")} />
              </div>
              {(photos.length > 0 || adding) && (
                <ul className="mt-1 flex flex-wrap gap-2">
                  {photos.map((p) => (
                    <li key={p.cid} className="relative flex w-28 flex-col gap-1.5">
                      <img src={p.preview} alt="" className="size-28 rounded-xl border object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((ps) => ps.filter((x) => x.cid !== p.cid))}
                        className="bg-background/90 absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full border"
                        aria-label={t("citizen.removePhoto")}
                      >
                        <X className="size-3.5" />
                      </button>
                      {p.distanceM === null ? (
                        <span className="tone tone-slate rounded-lg px-2 py-1 text-[11px] leading-tight">{t("citizen.photoNoLocation")}</span>
                      ) : (
                        <PhotoLocation distanceM={p.distanceM} nearSite={p.nearSite} />
                      )}
                    </li>
                  ))}
                  {adding && (
                    <li className="bg-muted text-muted-foreground flex size-28 flex-col items-center justify-center gap-2 rounded-xl text-xs">
                      <Loader2 className="size-5 animate-spin" /> {t("citizen.photoAdding")}
                    </li>
                  )}
                </ul>
              )}
            </Field>
            <p className="text-muted-foreground text-xs">{t("citizen.gasless")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={busy || adding || !projectId || text.trim().length < 10}>
              {busy ? t("citizen.submitting") : t("common.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
