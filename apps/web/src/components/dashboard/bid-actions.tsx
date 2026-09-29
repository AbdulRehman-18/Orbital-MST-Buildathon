import { getProject, getTender, type Tender } from "@namma-seva/api-client";
import { Download, Gavel, LockKeyhole, Unlock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Hex } from "viem";
import { Amount, Field } from "@/components/common/bits";
import { ActionDialog } from "@/components/dashboard/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApi, useChainStatus, useMode } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  bidCommitment,
  downloadBackup,
  forgetBid,
  loadBid,
  newSalt,
  parseBackup,
  saveBid,
  type SavedBid,
} from "@/lib/bids";
import { chain } from "@/lib/chain";
import { formatAmount, formatDateTime, toChainAmount } from "@/lib/format";
import { useChainTx } from "@/lib/tx";

/** The contractor's side of one tender: place or change a sealed bid, keep its backup, then open it. */
export function BidActions({ tender }: { tender: Tender }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const mode = useMode();
  const me = user!.walletAddress!;
  const detail = useApi(["/api/tenders", tender.id], () => getTender(tender.id));
  const [, rerender] = useState(0);
  const refresh = () => (rerender((n) => n + 1), void detail.refetch());

  const mine = detail.data?.bids.find((b) => b.bidderAddr.toLowerCase() === me.toLowerCase());
  const saved = loadBid(chain.id, tender.id, me);
  const money = (v: string) => formatAmount(v, mode);

  if (!detail.data) return null;
  if (mine?.revealedAmount)
    return (
      <p className="tone-green text-sm font-medium text-(--tone-fg)">
        {t("contractor.bidRevealed", { amount: money(mine.revealedAmount) })}
      </p>
    );
  if (tender.status !== "OPEN" || tender.phase === "AWAITING_AWARD") {
    return (
      <p className="text-muted-foreground text-sm">
        {mine ? t("contractor.bidNotOpened") : t("contractor.bidClosed")}
      </p>
    );
  }

  if (tender.phase === "REVEAL") {
    if (!mine) return <p className="text-muted-foreground text-sm">{t("contractor.bidClosed")}</p>;
    return (
      <RevealBid
        tender={tender}
        commitHash={mine.commitHash as Hex}
        saved={saved}
        onDone={refresh}
      />
    );
  }

  // Bidding is open.
  return (
    <div className="flex w-full flex-col gap-3">
      {mine && (
        <div className="tone tone-violet flex flex-col gap-1 rounded-xl px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <LockKeyhole className="size-4" /> {t("contractor.bidSealed")}
          </p>
          {saved && (
            <p className="text-foreground">
              {t("contractor.bidYourPrice", { amount: money(saved.amount) })}
            </p>
          )}
          <p className="text-foreground/70">
            {t("contractor.bidOpensAt", {
              from: formatDateTime(tender.commitDeadline, i18n.language),
              to: formatDateTime(tender.revealDeadline, i18n.language),
            })}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <PlaceBid tender={tender} changing={!!mine} onDone={refresh} />
        {mine && saved && (
          <Button size="sm" variant="outline" onClick={() => downloadBackup(saved)}>
            <Download /> {t("contractor.bidDownload")}
          </Button>
        )}
      </div>
    </div>
  );
}

function PlaceBid({
  tender,
  changing,
  onDone,
}: {
  tender: Tender;
  changing: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const mode = useMode();
  const status = useChainStatus();
  const { send } = useChainTx();
  const project = useApi(["/api/projects", tender.projectId], () => getProject(tender.projectId));
  const [price, setPrice] = useState("");
  const me = user!.walletAddress! as Hex;
  const budget = project.data ? BigInt(project.data.project.budget) : null;

  let amount: bigint | null = null;
  try {
    amount = price ? toChainAmount(price, mode) : null;
  } catch {
    amount = null;
  }
  const valid = amount !== null && amount > 0n && budget !== null && amount <= budget;

  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" variant={changing ? "outline" : "default"} onClick={open}>
          <Gavel /> {changing ? t("contractor.bidChange") : t("contractor.bidPlace")}
        </Button>
      )}
      title={changing ? t("contractor.bidChange") : t("contractor.bidPlace")}
      submitLabel={changing ? t("contractor.bidChange") : t("contractor.bidPlace")}
      disabled={!valid}
      onSubmit={async () => {
        const registry = status.data?.contracts?.TenderRegistry as Hex | undefined;
        if (!registry || amount === null) return false;
        const salt = newSalt();
        const bid: SavedBid = {
          chainId: chain.id,
          tenderId: tender.id,
          bidder: me,
          amount: amount.toString(),
          salt,
        };
        // Save before sending so the code can never be lost; put the previous one back if the tx fails.
        const previous = loadBid(chain.id, tender.id, me);
        saveBid(bid);
        const hash = await send({
          label: t("contractor.bidPlace"),
          contract: "TenderRegistry",
          functionName: "commitBid",
          args: [
            BigInt(tender.id),
            bidCommitment({
              chainId: chain.id,
              registry,
              tenderId: BigInt(tender.id),
              bidder: me,
              amount,
              salt,
            }),
          ],
          kind: "commitBid",
          entityId: tender.id,
        });
        if (!hash) {
          if (previous) saveBid(previous);
          else forgetBid(chain.id, tender.id, me);
          return false;
        }
        onDone();
        return true;
      }}
    >
      <div className="bg-muted/60 flex flex-col gap-2 rounded-xl p-4 text-sm">
        <p className="font-medium">{t("contractor.bidHowTitle")}</p>
        <ol className="text-muted-foreground flex list-decimal flex-col gap-1.5 pl-5">
          <li>{t("contractor.bidStep1")}</li>
          <li>{t("contractor.bidStep2")}</li>
          <li>{t("contractor.bidStep3")}</li>
        </ol>
      </div>
      <Field
        label={t("contractor.bidAmount")}
        hint={
          budget !== null
            ? t("contractor.bidBudget", { budget: formatAmount(budget, mode) })
            : undefined
        }
      >
        <Input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
         
        />
      </Field>
      <p className="text-muted-foreground text-xs">{t("contractor.bidKeep")}</p>
    </ActionDialog>
  );
}

function RevealBid({
  tender,
  commitHash,
  saved,
  onDone,
}: {
  tender: Tender;
  commitHash: Hex;
  saved: SavedBid | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const status = useChainStatus();
  const { send } = useChainTx();
  const [pasted, setPasted] = useState("");
  const me = user!.walletAddress! as Hex;
  const registry = status.data?.contracts?.TenderRegistry as Hex | undefined;
  const bid = saved ?? parseBackup(pasted);
  // Check the price and code against the sealed fingerprint before sending, so a wrong backup fails here, not on-chain.
  const matches =
    !!bid &&
    !!registry &&
    bidCommitment({
      chainId: chain.id,
      registry,
      tenderId: BigInt(tender.id),
      bidder: me,
      amount: BigInt(bid.amount),
      salt: bid.salt,
    }).toLowerCase() === commitHash.toLowerCase();

  return (
    <ActionDialog
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          <Unlock /> {t("contractor.bidReveal")}
        </Button>
      )}
      title={t("contractor.bidReveal")}
      description={t("contractor.bidRevealBody")}
      submitLabel={t("contractor.bidReveal")}
      disabled={!matches}
      onSubmit={async () => {
        if (!bid) return false;
        const hash = await send({
          label: t("contractor.bidReveal"),
          contract: "TenderRegistry",
          functionName: "revealBid",
          args: [BigInt(tender.id), BigInt(bid.amount), bid.salt],
          kind: "revealBid",
          entityId: tender.id,
        });
        if (hash) {
          saveBid(bid);
          onDone();
        }
        return !!hash;
      }}
    >
      {!saved && (
        <Field label={t("contractor.bidBackup")} hint={t("contractor.bidMissing")}>
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            className="font-mono text-xs"
          />
        </Field>
      )}
      {bid &&
        (matches ? (
          <p className="text-sm">
            {t("contractor.bidYourPrice", { amount: "" })}
            <Amount value={bid.amount} className="font-medium" />
          </p>
        ) : (
          <p className="text-destructive text-sm">{t("contractor.bidMismatch")}</p>
        ))}
    </ActionDialog>
  );
}
