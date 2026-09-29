// Wallet-signed transactions with the plan §11.1 UX:
//   Sign in wallet → Pending → Mined ✓ [View on mstscan] → indexed (live update)
import {
  grievanceRegistryAbi,
  milestoneEscrowAbi,
  nammaSevaAccessAbi,
  projectRegistryAbi,
  tenderRegistryAbi,
} from "@namma-seva/chain";
import { getTrackedTx, trackTx } from "@namma-seva/api-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Abi, type Hex } from "viem";
import { getConnection, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { errorMessage, queryClient, useChainStatus } from "./api";
import { chain, explorerTx } from "./chain";
import { wagmiConfig } from "./wagmi";

const ABIS = {
  ProjectRegistry: projectRegistryAbi,
  MilestoneEscrow: milestoneEscrowAbi,
  GrievanceRegistry: grievanceRegistryAbi,
  TenderRegistry: tenderRegistryAbi,
  NammaSevaAccess: nammaSevaAccessAbi,
} as const;
export type ContractKey = keyof typeof ABIS;

export type TxRequest = {
  label: string;
  contract: ContractKey;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
  /** For /api/tx/track and the "Pending" badge. */
  kind: string;
  entityId?: string | number;
};

/** Revert reason as the contract's custom error name, e.g. "AlreadyApproved". */
export function txError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "rejected";
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (revert?.data?.errorName) return revert.data.errorName;
    return err.shortMessage;
  }
  return errorMessage(err);
}

/** Poll /api/tx/:hash until the indexer has confirmed the tx (≤ 3 min), then refresh all queries. */
async function followIndexing(hash: string, onIndexed: () => void) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const tx = await getTrackedTx(hash).catch(() => null);
    if (tx?.status === "confirmed") {
      await queryClient.invalidateQueries();
      onIndexed();
      return;
    }
    if (tx?.status === "failed" || tx?.status === "dropped") return;
  }
  void queryClient.invalidateQueries();
}

export function useChainTx() {
  const { t } = useTranslation();
  const status = useChainStatus();
  const [pending, setPending] = useState<string | null>(null);

  async function send(req: TxRequest): Promise<Hex | null> {
    const address = status.data?.contracts?.[req.contract] as Hex | undefined;
    if (!address) {
      toast.error(t("tx.noContracts"));
      return null;
    }
    const id = toast.loading(t("tx.confirmInWallet", { action: req.label }));
    setPending(req.label);
    try {
      const connection = getConnection(wagmiConfig);
      if (!connection.address) throw new Error(t("tx.noWallet"));
      if (connection.chainId !== chain.id) await switchChain(wagmiConfig, { chainId: chain.id });

      const hash = await writeContract(wagmiConfig, {
        address,
        abi: ABIS[req.contract] as Abi,
        functionName: req.functionName,
        args: req.args,
        value: req.value,
        chainId: chain.id,
      } as never);
      toast.loading(t("tx.pending", { action: req.label }), { id, description: `${hash.slice(0, 18)}…` });
      void trackTx({ txHash: hash, kind: req.kind, entityId: req.entityId?.toString() }).catch(() => undefined);

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: chain.id });
      if (receipt.status !== "success") throw new Error(t("tx.reverted"));
      const url = explorerTx(hash);
      toast.success(t("tx.mined", { action: req.label }), {
        id,
        description: t("tx.indexing"),
        action: url ? { label: t("tx.view"), onClick: () => window.open(url, "_blank", "noopener") } : undefined,
      });
      // Dashboards read the indexed database, which lags the chain by CONFIRMATIONS blocks (~20 s on
      // MST). Follow the tracked tx until the indexer has it, then refresh (the socket does too).
      void followIndexing(hash, () =>
        toast.success(t("tx.indexed", { action: req.label }), {
          id,
          action: url ? { label: t("tx.view"), onClick: () => window.open(url, "_blank", "noopener") } : undefined,
        }),
      );
      return hash;
    } catch (err) {
      const reason = txError(err);
      toast.error(reason === "rejected" ? t("tx.rejected") : t("tx.failed", { action: req.label }), {
        id,
        description: reason === "rejected" ? undefined : reason,
      });
      return null;
    } finally {
      setPending(null);
    }
  }

  return { send, pending, ready: !!status.data?.contracts };
}
