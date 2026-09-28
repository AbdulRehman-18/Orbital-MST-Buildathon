import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";

/**
 * Dialog around one wallet action. `onSubmit` returns true to close; errors are toasted
 * (transaction errors are already toasted by useChainTx and return false).
 */
export function ActionDialog({
  trigger,
  title,
  description,
  children,
  submitLabel,
  onSubmit,
  disabled,
  destructive,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  submitLabel: string;
  onSubmit: () => Promise<boolean>;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (await onSubmit()) setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children && <div className="flex flex-col gap-4">{children}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={busy || disabled} variant={destructive ? "destructive" : "default"}>
              {busy && <Loader2 className="animate-spin" />} {submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
