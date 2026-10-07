"use client";
import { useRef, useEffect } from "react";
import { useTransactionState } from "@biblio/marketplace-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@starknet-react/core";
import { getAppMarketplaceClient } from "./app-client";
import { useMarketConfig } from "./react";
import {
  readPending,
  PENDING_TRANSACTION_KEY,
  type AccountCall,
  type TradeContext,
  type PendingStorage,
} from "@biblio/marketplace";
export type { TradeState } from "@biblio/marketplace";
export function useTrade() {
  const { account, address, connector } = useAccount(),
    config = useMarketConfig(),
    client = getAppMarketplaceClient();
  const controller = client.transactions;
  const queries = useQueryClient();
  const snapshot = useTransactionState(controller);
  const current = useRef<TradeContext>({});
  const storage: PendingStorage = {
    getItem(key) {
      const scoped = localStorage.getItem(key);
      if (scoped) return scoped;
      const cfg = config.data;
      if (!address || !cfg?.marketplace) return null;
      const old = readPending(
        localStorage.getItem(PENDING_TRANSACTION_KEY),
        address,
        cfg.chain,
        cfg.marketplace,
      );
      if (old) {
        localStorage.setItem(key, JSON.stringify(old));
        localStorage.removeItem(PENDING_TRANSACTION_KEY);
        return JSON.stringify(old);
      }
      return null;
    },
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  };
  useEffect(() => {
    current.current = {
      config: config.data,
      expectedMarketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS,
      storage,
      account:
        account && address
          ? {
              address,
              getChainId: async () =>
                connector ? connector.chainId() : account.getChainId(),
              execute: (calls) => account.execute(calls),
              waitForTransaction: (hash, options) =>
                account.waitForTransaction(hash, options),
              getTransactionReceipt: (hash) =>
                account.getTransactionReceipt(hash),
            }
          : undefined,
    };
  });
  return {
    execute: async (
      prepare: (marketplace: string) => Promise<AccountCall[]> | AccountCall[],
      mode: "trade" | "cancel" = "trade",
    ) => {
      const accepted =
        (await controller.execute(() => current.current, prepare, mode)) ===
        true;
      if (accepted) await queries.invalidateQueries();
      return accepted;
    },
    resume: () => controller.resume(() => ({...current.current,config:current.current.config??{chain:client.options.chain,chainId:client.options.chainId,marketplace:client.options.expectedMarketplace??null,demo:false,status:{safeForCheckout:false}}})),
    state: snapshot.state,
    busy: snapshot.busy,
    config: config.data,
    account,
    address,
  };
}
