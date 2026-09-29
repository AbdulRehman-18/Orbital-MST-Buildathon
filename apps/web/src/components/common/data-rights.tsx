import { eraseMyData, exportMyData } from "@namma-seva/api-client";
import { Download, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** DPDP Act 2023 rights of access and erasure for a citizen's off-chain data (plan §17). */
export function DataRightsCard() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function download() {
    setBusy("export");
    try {
      const data = await exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: "namma-seva-my-data.json" });
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("dataRights.exported"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function erase() {
    setBusy("erase");
    try {
      await eraseMyData();
      setConfirming(false);
      toast.success(t("dataRights.erased"));
      await signOut();
      navigate("/");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t("dataRights.title")}</CardTitle>
        <CardDescription className="text-base">{t("dataRights.body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={download} disabled={busy !== null}>
          {busy === "export" ? <Loader2 className="animate-spin" /> : <Download />} {t("dataRights.export")}
        </Button>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)} disabled={busy !== null}>
          <Trash2 /> {t("dataRights.erase")}
        </Button>
      </CardContent>

      <Dialog open={confirming} onOpenChange={(open) => busy === null && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dataRights.eraseTitle")}</DialogTitle>
            <DialogDescription>{t("dataRights.eraseBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy !== null}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={erase} disabled={busy !== null}>
              {busy === "erase" && <Loader2 className="animate-spin" />} {t("dataRights.eraseConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
