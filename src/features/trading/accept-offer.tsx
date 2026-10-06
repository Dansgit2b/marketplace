"use client";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiOrder } from "@/lib/marketplace/types";
import { useTrade } from "@/lib/marketplace/use-trade";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import {
  parseOrderKey,
  buildNftApproval,
  uint256,
} from "@/lib/marketplace/write-adapter";
import { getTokenSymbol } from "@/lib/marketplace/token-display";
import { TradeStatus } from "./trade-status";
type Quote = {
  canSubmit: boolean;
  reasons: string[];
  expiresAt: number;
  rows: Array<{
    valid: boolean;
    message?: string;
    sellerProceeds: string;
    protocolFee: string;
    royaltyAmount: string;
    needsNftApproval: boolean;
  }>;
};
export function AcceptOffer({
  order,
  tokenId,
}: {
  order: ApiOrder;
  tokenId: string;
}) {
  const trade = useTrade();
  const [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState("");
  async function preview() {
    try {
      setError("");
      if (!trade.config?.marketplace)
        throw new Error("Market is not configured.");
      const key = parseOrderKey(
        order.id,
        trade.config.chain,
        trade.config.marketplace,
      );
      const result = await marketplaceRequest<Quote>(
        "/checkout/preflight",
        {},
        {
          action: "accept",
          account: trade.address,
          items: [{ ...key, tokenId }],
        },
      );
      if (!result.canSubmit)
        throw new Error(
          result.reasons.join(", ") ||
            result.rows.find((r) => !r.valid)?.message ||
            "Offer unavailable.",
        );
      setQuote(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    }
  }
  async function accept() {
    await trade.execute((m) => {
      if (!quote || quote.expiresAt <= Math.floor(Date.now() / 1000))
        throw new Error("Preview expired. Review the offer again.");
      const key = parseOrderKey(order.id, trade.config!.chain, m),
        row = quote.rows[0],
        calls = [];
      if (row.needsNftApproval)
        calls.push(buildNftApproval(order.collection, m, tokenId));
      calls.push({
        contractAddress: m,
        entrypoint:
          order.kind === "collection_offer"
            ? "accept_collection_offer"
            : "accept_offer",
        calldata: [
          key.maker,
          key.nonce,
          ...(order.kind === "collection_offer" ? uint256(tokenId) : []),
          order.currency,
          ...uint256(row.sellerProceeds),
        ],
      });
      return calls;
    });
  }
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        disabled={trade.busy || !trade.address || !!trade.config?.demo}
        onClick={() => void preview()}
      >
        Review offer
      </Button>
      {quote && (
        <div className="rounded-md border p-3 text-sm">
          <p>
            You receive at least{" "}
            {formatCurrencyAmount(quote.rows[0].sellerProceeds, order.currency)}{" "}
            {getTokenSymbol(order.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            Protocol:{" "}
            {formatCurrencyAmount(quote.rows[0].protocolFee, order.currency)} ·
            royalty:{" "}
            {formatCurrencyAmount(quote.rows[0].royaltyAmount, order.currency)}
          </p>
          <Button
            className="mt-2"
            size="sm"
            disabled={trade.busy}
            onClick={() => void accept()}
          >
            Confirm acceptance
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <TradeStatus state={trade.state} />
    </div>
  );
}
