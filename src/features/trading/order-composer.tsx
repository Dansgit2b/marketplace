"use client";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTrade } from "@/lib/marketplace/use-trade";
import {
  buildApproval,
  buildCreateOrder,
  buildNftApproval,
  buildCancel,
  parseRoyaltyBps,
  parseAmount,
  parseOrderKey,
  type AccountCall,
} from "@/lib/marketplace/write-adapter";

import { TradeStatus } from "./trade-status";
export function OrderComposer({
  collection,
  tokenIds,
  kind,
  replaceIds = [],
  assets: providedAssets,
}: {
  assets?: Array<{ collection: string; tokenId: string }>;
  collection: string;
  tokenIds?: string[];
  kind: "listing" | "token_offer" | "collection_offer";
  replaceIds?: string[];
}) {
  const trade = useTrade();
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [duration, setDuration] = useState("86400");
  const [royalty, setRoyalty] = useState("10");
  const currencies = trade.config?.currencies ?? [];
  const selected =
    currencies.find((c) => c.address === currency) ?? currencies[0];
  const assets =
    providedAssets ??
    (tokenIds ?? []).map((tokenId) => ({ collection, tokenId }));
  const count = kind === "collection_offer" ? 1 : assets.length;
  let preview: string | null = null;
  try {
    if (selected && price) {
      const p = BigInt(parseAmount(price, selected.decimals));
      const fee = (p * BigInt(trade.config?.feeBps ?? 0)) / 10000n;
      const cap = (p * parseRoyaltyBps(royalty)) / 10000n;
      preview = ((p - fee - cap) * BigInt(count)).toString();
    }
  } catch {
    /* Incomplete user input has no valid preview. */
  }
  async function submit() {
    await trade.execute(async (marketplace) => {
      if (!selected || !count || count > 25)
        throw new Error("Choose a currency and 1–25 assets.");
      const amount = parseAmount(price, selected.decimals);
      const capBps = parseRoyaltyBps(royalty);
      const royaltyCap = (
        (BigInt(amount) * BigInt(capBps)) /
        10000n
      ).toString();
      const expiry = Math.floor(Date.now() / 1000) + Number(duration);
      const calls: AccountCall[] = [];
      for (const id of replaceIds) {
        const key = parseOrderKey(id, trade.config!.chain, marketplace);
        if (BigInt(key.maker) !== BigInt(trade.address!))
          throw new Error("Only your orders can be replaced.");
        calls.push(buildCancel(marketplace, key.nonce));
      }
      if (kind !== "listing")
        calls.push(
          buildApproval(
            selected.address,
            marketplace,
            (BigInt(amount) * BigInt(count)).toString(),
          ),
        );
      for (const asset of kind === "collection_offer"
        ? [{ collection, tokenId: undefined }]
        : assets) {
        if (kind === "listing")
          calls.push(
            buildNftApproval(asset.collection, marketplace, asset.tokenId!),
          );
        calls.push(
          buildCreateOrder({
            marketplace,
            kind,
            collection: asset.collection,
            tokenId: asset.tokenId,
            currency: selected.address,
            price: amount,
            expiry,
            royaltyCap,
          }),
        );
      }
      return calls;
    });
  }
  const title =
    kind === "listing"
      ? replaceIds.length
        ? "Reprice selected"
        : "List for sale"
      : kind === "collection_offer"
        ? "Make collection offer"
        : "Make offer";
  return (
    <div className="space-y-3">
      <h3 className="font-medium">{title}</h3>
      <div className="flex gap-2">
        <Input
          aria-label="Price"
          placeholder="Total buyer price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Select value={selected?.address ?? ""} onValueChange={setCurrency}>
          <SelectTrigger className="w-32" aria-label="Currency">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c.address} value={c.address}>
                {c.symbol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">
          Maximum royalty (%)
          <Input
            aria-label="Maximum royalty percent"
            value={royalty}
            onChange={(e) => setRoyalty(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Duration
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger aria-label="Duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["3600", "1 hour"],
                ["86400", "1 day"],
                ["604800", "7 days"],
                ["2592000", "30 days"],
              ].map(([v, n]) => (
                <SelectItem key={v} value={v}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Price is the buyer’s total per NFT. Protocol fees and royalties are
        deducted from seller proceeds.{" "}
        {kind === "collection_offer"
          ? "This offer buys one NFT from this collection."
          : count > 1
            ? `${count} orders will be created in one transaction.`
            : ""}{" "}
        {kind !== "listing"
          ? "Offer funds remain in your wallet and are not reserved."
          : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {preview && BigInt(preview) > 0n
          ? `Minimum seller proceeds at this royalty cap: ${formatCurrencyAmount(preview, selected?.address, selected?.decimals)} ${selected?.symbol ?? ""}`
          : "Enter terms to preview seller proceeds."}
      </p>
      <Button
        onClick={() => void submit()}
        disabled={
          trade.busy ||
          !trade.address ||
          !price ||
          !count ||
          !!trade.config?.demo
        }
        className="w-full"
      >
        {trade.busy
          ? "Processing…"
          : !trade.address
            ? "Connect wallet to trade"
            : title}
      </Button>
      <TradeStatus state={trade.state} />
    </div>
  );
}
