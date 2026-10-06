"use client";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useCartStore } from "../store/cart-store";
import { useTrade } from "@/lib/marketplace/use-trade";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import {
  parseOrderKey,
  buildBuyMany,
  buildApproval,
} from "@/lib/marketplace/write-adapter";
import { getTokenSymbol } from "@/lib/marketplace/token-display";
import { TradeStatus } from "@/features/trading/trade-status";
type Preflight = {
  canSubmit: boolean;
  reasons: string[];
  total: string | null;
  currency: string;
  approvalAmount: string;
  expiresAt: number;
  rows: Array<{
    key: string;
    valid: boolean;
    message?: string;
    collection?: string;
    tokenId?: string;
  }>;
};
export function CartSidebar() {
  const {
    items,
    isOpen,
    setOpen,
    removeItem,
    clearCart,
    inlineErrors,
    setItemError,
    clearInlineErrors,
    lastActionError,
  } = useCartStore();
  const trade = useTrade();
  const total = items.reduce((sum, item) => sum + BigInt(item.price), 0n);
  const currency = items[0]?.currency;
  async function checkout() {
    clearInlineErrors();
    const accepted = await trade.execute(async (marketplace) => {
      const keys = items.map((item) =>
        parseOrderKey(item.orderId, trade.config!.chain, marketplace),
      );
      const quote = await marketplaceRequest<Preflight>(
        "/checkout/preflight",
        {},
        {
          account: trade.address,
          items: items.map((item, i) => ({
            ...keys[i],
            buyerDebit: item.price,
          collection:item.collection,tokenId:item.tokenId,
            currency: item.currency,
          })),
        },
      );
      for (const row of quote.rows)
        if (!row.valid)
          setItemError(row.key, row.message ?? "Listing unavailable.");
      if (!quote.canSubmit)
        throw new Error(
          quote.reasons.join(", ") ||
            "Some listings are no longer available. Remove or refresh them.",
        );
      if (
        !quote.total ||
        BigInt(quote.total) !== total ||
        BigInt(quote.currency) !== BigInt(currency!)
      )
        throw new Error("Cart terms changed. Review the cart.");
      const calls = [];
      if (BigInt(quote.approvalAmount) > 0n)
        calls.push(buildApproval(currency!, marketplace, quote.approvalAmount));
      calls.push(
        buildBuyMany(
          marketplace,
          keys,
          currency!,
          total.toString(),
          quote.expiresAt,
        ),
      );
      return calls;
    });
    if (accepted) clearCart();
  }
  return (
    <>
      <Button
        aria-label={`Cart (${items.length})`}
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <ShoppingCart className="size-4" />
        <span>{items.length}</span>
      </Button>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Cart</SheetTitle>
            <SheetDescription>
              One currency. Up to 25 NFTs. All purchases settle together.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4">
            {items.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Your cart is empty.
              </p>
            ) : (
              items.map((item) => (
                <div key={item.orderId} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {item.tokenName ?? `Token #${item.tokenId}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrencyAmount(item.price, item.currency)}{" "}
                        {getTokenSymbol(item.currency)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${item.tokenName ?? item.tokenId}`}
                      disabled={trade.busy}
                      onClick={() => removeItem(item.orderId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {inlineErrors[item.orderId] && (
                    <p role="alert" className="mt-2 text-xs text-destructive">
                      {inlineErrors[item.orderId]}
                    </p>
                  )}
                </div>
              ))
            )}
            {lastActionError && (
              <p role="alert" className="text-destructive">
                {lastActionError}
              </p>
            )}
            <TradeStatus state={trade.state} />
          </div>
          <div className="space-y-3 border-t p-4">
            <div className="flex justify-between font-medium">
              <span>Total payment</span>
              <span>
                {formatCurrencyAmount(total, currency) ?? "0"}{" "}
                {currency ? getTokenSymbol(currency) : ""}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Includes marketplace fees and royalties. Network fees are
              separate.
            </p>
            <Button
              className="w-full"
              disabled={
                !items.length ||
                trade.busy ||
                !trade.address ||
                !!trade.config?.demo
              }
              onClick={() => void checkout()}
            >
              {trade.busy
                ? "Processing…"
                : !trade.address
                  ? "Connect wallet to checkout"
                  : trade.config?.demo
                    ? "Demo — trading disabled"
                    : "Checkout"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
