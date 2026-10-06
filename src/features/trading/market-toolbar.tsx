"use client";
import { useTrade } from "@/lib/marketplace/use-trade";
import { TradeStatus } from "./trade-status";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useMarketConfig } from "@/lib/marketplace/react";
import { Badge } from "@/components/ui/badge";
export function MarketToolbar() {
  const config = useMarketConfig();
  const trade = useTrade();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-xs">
      <nav className="flex gap-4" aria-label="Marketplace tools">
        <Link href="/trader" className="hover:text-primary">
          Trading dashboard
        </Link>
        <Link href="/notifications" className="hover:text-primary">
          Notifications
        </Link>
        <Link href="/ops" className="hover:text-primary">
          Market status
        </Link>
      </nav>
      {config.data?.demo ? (
        <Badge variant="outline">Demo data · trading disabled</Badge>
      ) : config.data?.status.safeForCheckout ? (
        <span className="text-muted-foreground">
          Indexed block {config.data.status.indexedBlock}
        </span>
      ) : (
        <Badge variant="outline">
          {config.isError ? "Market data unavailable" : "Trading unavailable"}
        </Badge>
      )}
      {trade.address && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trade.busy}
          onClick={() => void trade.resume()}
        >
          Check saved transaction
        </Button>
      )}
      <TradeStatus state={trade.state} />
    </div>
  );
}
