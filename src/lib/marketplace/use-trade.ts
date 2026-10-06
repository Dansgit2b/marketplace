"use client";
import { useAccount } from "@starknet-react/core";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { useMarketConfig } from "./react";
import { marketplaceRequest } from "./api-client";
import type { AccountCall } from "./write-adapter";
import {
  PENDING_TRANSACTION_KEY as KEY,
  readPending,
  receiptOutcome,
  type PendingTransaction,
} from "./pending-transaction";
export type TradeState = {
  stage:
    | "idle"
    | "checking"
    | "signature"
    | "submitted"
    | "accepted"
    | "indexing"
    | "reflected"
    | "reverted"
    | "error";
  message: string;
  hash?: string;
};
// One coordinator across all forms prevents concurrent signatures and duplicate monitoring.
const useTransaction = create<{
  state: TradeState;
  busy: boolean;
  set: (state: TradeState, busy?: boolean) => void;
}>((set) => ({
  state: { stage: "idle", message: "" },
  busy: false,
  set: (state, busy = false) => set({ state, busy }),
}));
export function useTrade() {
  const { account, address, connector } = useAccount(),
    config = useMarketConfig(),
    queries = useQueryClient();
  const { state, busy, set } = useTransaction();
  function pending() {
    const cfg = config.data;
    return address && cfg?.marketplace
      ? readPending(
          localStorage.getItem(KEY),
          address,
          cfg.chain,
          cfg.marketplace,
        )
      : null;
  }
  async function monitor(record: PendingTransaction) {
    if (!account) return false;
    set(
      {
        stage: record.stage,
        message: "Checking the submitted transaction…",
        hash: record.hash,
      },
      true,
    );
    try {
      const receipt = await account
        .waitForTransaction(record.hash, {
          successStates: ["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"],
          retryInterval: 1000,
          retries: 30,
        })
        .catch(() => account.getTransactionReceipt(record.hash));
      const outcome = receiptOutcome(receipt);
      if (outcome === "reverted") {
        localStorage.removeItem(KEY);
        set({
          stage: "reverted",
          message:
            "Transaction reverted. No trades completed; review the order before retrying.",
          hash: record.hash,
        });
        return false;
      }
      if (outcome !== "accepted") {
        set({
          stage: "submitted",
          message:
            "Transaction is still pending. Check its status before submitting again.",
          hash: record.hash,
        });
        return false;
      }
      localStorage.setItem(
        KEY,
        JSON.stringify({ ...record, stage: "accepted" }),
      );
      set(
        {
          stage: "indexing",
          message: "Accepted on-chain. Waiting for marketplace data…",
          hash: record.hash,
        },
        true,
      );
      const block =
        "block_number" in receipt ? receipt.block_number : undefined;
      let reflected = false;
      for (let i = 0; i < 30; i++) {
        try {
          const result = await marketplaceRequest<{ reflected: boolean }>(
            `/transactions/${record.hash}`,
            { block },
          );
          if (result.reflected) {
            reflected = true;
            break;
          }
        } catch {
          /* Index outages do not undo acceptance. */
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (reflected) localStorage.removeItem(KEY);
      await queries.invalidateQueries();
      set({
        stage: reflected ? "reflected" : "accepted",
        message: reflected
          ? "Trade confirmed and marketplace updated."
          : "Trade accepted. Indexing is delayed; check status instead of submitting again.",
        hash: record.hash,
      });
      return true;
    } catch {
      // Receipt failures are ambiguous. Retain the hash and allow status recovery.
      set({
        stage: record.stage,
        message:
          "Receipt check unavailable. Your transaction is saved; check status before submitting again.",
        hash: record.hash,
      });
      return false;
    }
  }
  async function resume() {
    if (useTransaction.getState().busy) return false;
    const record = pending();
    if (!record) return false;
    if (
      !account ||
      BigInt(await (connector ? connector.chainId() : account.getChainId())) !==
        BigInt(config.data!.chainId)
    ) {
      set({
        stage: "error",
        message: "Switch to the marketplace network to check this transaction.",
      });
      return false;
    }
    return monitor(record);
  }
  async function execute(
    prepare: (marketplace: string) => Promise<AccountCall[]> | AccountCall[],
    mode: "trade" | "cancel" = "trade",
  ) {
    if (useTransaction.getState().busy) return false;
    try {
      if (!account || !address) throw new Error("Connect your wallet first.");
      const cfg = config.data;
      if (
        !cfg?.marketplace ||
        cfg.demo ||
        (!cfg.status.safeForCheckout && mode !== "cancel")
      )
        throw new Error(
          cfg?.demo
            ? "Demo data: trading is disabled."
            : "Trading is unavailable while the market is syncing or unconfigured.",
        );
      const expected = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS;
      if (!expected || BigInt(expected) !== BigInt(cfg.marketplace))
        throw new Error(
          "Marketplace deployment is not configured for this frontend.",
        );
      if (
        BigInt(
          await (connector ? connector.chainId() : account.getChainId()),
        ) !== BigInt(cfg.chainId)
      )
        throw new Error("Switch your wallet to the marketplace network.");
      const saved = pending();
      if (saved) {
        set({
          stage: saved.stage,
          message:
            "A saved transaction needs a status check before another submission.",
          hash: saved.hash,
        });
        return false;
      }
      set(
        { stage: "checking", message: "Checking order terms and approvals…" },
        true,
      );
      const calls = await prepare(cfg.marketplace);
      if (!calls.length) throw new Error("No transaction calls to execute.");
      set(
        {
          stage: "signature",
          message: "Confirm the transaction in your wallet.",
        },
        true,
      );
      const tx = await account.execute(calls);
      const record: PendingTransaction = {
        hash: tx.transaction_hash,
        account: address,
        chain: cfg.chain,
        marketplace: cfg.marketplace,
        stage: "submitted",
      };
      localStorage.setItem(KEY, JSON.stringify(record));
      return await monitor(record);
    } catch (error) {
      set({
        stage: "error",
        message: error instanceof Error ? error.message : "Transaction failed.",
      });
      return false;
    }
  }
  return {
    execute,
    resume,
    state,
    busy,
    config: config.data,
    account,
    address,
  };
}
