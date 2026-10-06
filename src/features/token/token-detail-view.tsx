"use client";
import { formatCurrencyAmount } from "@/lib/marketplace/amount-display";
import { BestBid } from "@/features/trading/best-bid";
import { AcceptOffer } from "@/features/trading/accept-offer";
import { ReportToken } from "@/features/trading/report-token";
import Image from "next/image";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  useTokenDetailQuery,
  useCollectionListingsQuery,
} from "@/lib/marketplace/hooks";
import { useTokenOwnership } from "./use-token-ownership";
import { useTrade } from "@/lib/marketplace/use-trade";
import {
  tokenName,
  tokenImage,
  getTokenSymbol,
} from "@/lib/marketplace/token-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAddToCartFeedback } from "@/features/cart/hooks/use-add-to-cart-feedback";
import {
  cheapestListingByTokenId,
  cartItemFromTokenListing,
} from "@/features/cart/listing-utils";
import { OrderComposer } from "@/features/trading/order-composer";
import { TradeStatus } from "@/features/trading/trade-status";
import { marketplaceRequest } from "@/lib/marketplace/api-client";
import { buildCancel, parseOrderKey } from "@/lib/marketplace/write-adapter";
import type { ApiOrder, ApiPage } from "@/lib/marketplace/types";
export function TokenDetailView({
  address,
  tokenId,
  projectId,
}: {
  address: string;
  tokenId: string;
  projectId?: string;
}) {
  const detail = useTokenDetailQuery({
    collection: address,
    tokenId,
    projectId,
    fetchImages: true,
  });
  const listings = useCollectionListingsQuery({
    collection: address,
    tokenId,
    projectId,
  });
  const trade = useTrade();
  const ownership = useTokenOwnership({
    collection: address,
    tokenId,
    walletAddress: trade.address,
    isConnected: !!trade.address,
  });
  const { addListingToCart } = useAddToCartFeedback();
  const offers = useInfiniteQuery<ApiPage<ApiOrder>>({
    initialPageParam:undefined as string|undefined,
    getNextPageParam:page=>page.nextCursor??undefined,
    queryKey: ["owned", "token-offers", address, tokenId],
    queryFn: ({pageParam}) =>
      marketplaceRequest<ApiPage<ApiOrder>>(`/collections/${address}/offers`, {
        state: "open",
        tokenMatch: tokenId,
        limit: 50,cursor:pageParam,
      }),
  });
  const activity = useInfiniteQuery<ApiPage<{id:string;type:string;buyerDebit?:string;currency?:string;provenance:{timestamp:number}}>>({
    initialPageParam:undefined as string|undefined,
    getNextPageParam:page=>page.nextCursor??undefined,
    queryKey: ["owned", "activity", address, tokenId],
    queryFn: ({pageParam}) =>
      marketplaceRequest<
        ApiPage<{
          id: string;
          type: string;
          buyerDebit?: string;
          currency?: string;
          provenance: { timestamp: number };
        }>
      >(`/tokens/${address}/${tokenId}/activity`, { limit: 20,cursor:pageParam }),
  });
  const offerItems=offers.data?.pages.flatMap(page=>page.items)??[];
  const activityItems=activity.data?.pages.flatMap(page=>page.items)??[];
  if (detail.isLoading)
    return <div className="p-8 text-muted-foreground">Loading token…</div>;
  if (detail.isError || !detail.data?.token)
    return (
      <Card>
        <CardContent className="p-8">
          <p role="alert">Unable to load this token.</p>
          <Button onClick={() => void detail.refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  const token = detail.data.token,
    image = tokenImage(token);
  const cheapest = cheapestListingByTokenId(listings.data).get(
    BigInt(tokenId).toString(),
  );
  const myListing = listings.data?.find(
    (l) => trade.address && BigInt(l.owner) === BigInt(trade.address),
  );
  const metadata = token.metadata as {
    description?: string;
    attributes?: Array<{ trait_type: string; value: unknown }>;
  };
  return (
    <main
      className="mx-auto max-w-7xl space-y-6 p-4 md:p-8"
      data-testid="token-detail"
    >
      <Link
        href={`/collections/${address}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Collection
      </Link>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
          {image ? (
            <Image
              src={image}
              alt={tokenName(token)}
              fill
              unoptimized
              className="object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              Image unavailable
            </div>
          )}
        </div>
        <div className="space-y-5">
          <Badge variant="outline">ERC-721</Badge>
          <h1 className="text-3xl font-semibold">{tokenName(token)}</h1>
          <p className="break-all text-xs text-muted-foreground">
            Owner: {ownership.holderAddress ?? "Not indexed"}
          </p>
          {metadata?.description && (
            <p className="text-sm text-muted-foreground">
              {metadata.description}
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Listings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {listings.data?.length ? (
                listings.data.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>
                      {formatCurrencyAmount(l.price, l.currency)}{" "}
                      {getTokenSymbol(l.currency)}
                    </span>
                    <Button
                      size="sm"
                      disabled={
                        !!trade.address &&
                        BigInt(l.owner) === BigInt(trade.address)
                      }
                      onClick={() => {
                        const chosen = cheapestListingByTokenId([l]).get(
                          BigInt(tokenId).toString(),
                        );
                        if (chosen)
                          addListingToCart(
                            cartItemFromTokenListing(token, address, chosen),
                          );
                      }}
                    >
                      Add to cart
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active listings.
                </p>
              )}
              {cheapest && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    addListingToCart(
                      cartItemFromTokenListing(token, address, cheapest),
                    )
                  }
                >
                  Add cheapest to cart
                </Button>
              )}
            </CardContent>
          </Card>
          {ownership.effectiveIsOwner ? (
            <Card>
              <CardContent className="space-y-4 p-5">
                {myListing && (
                  <Button
                    variant="destructive"
                    disabled={trade.busy}
                    onClick={() =>
                      void trade.execute(
                        (m) => [
                          buildCancel(
                            m,
                            parseOrderKey(myListing.id, trade.config!.chain, m)
                              .nonce,
                          ),
                        ],
                        "cancel",
                      )
                    }
                  >
                    Cancel my listing
                  </Button>
                )}
                <OrderComposer
                  collection={address}
                  tokenIds={[tokenId]}
                  kind="listing"
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-5">
                <OrderComposer
                  collection={address}
                  tokenIds={[tokenId]}
                  kind="token_offer"
                />
              </CardContent>
            </Card>
          )}
          <TradeStatus state={trade.state} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Traits</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {metadata?.attributes?.map((a, i) => (
              <div
                key={`${a.trait_type}-${i}`}
                className="rounded-md border p-3"
              >
                <p className="text-xs text-muted-foreground">{a.trait_type}</p>
                <p className="text-sm">{String(a.value)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Offers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BestBid
              collection={address}
              tokenId={tokenId}
              isOwner={ownership.effectiveIsOwner}
            />
            {offerItems
              .filter(
                (o) =>
                  o.kind !== "listing" &&
                  (o.tokenId == null || BigInt(o.tokenId) === BigInt(tokenId)),
              )
              .map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-2 border-b pb-2"
                >
                  <div>
                    <p>
                      {formatCurrencyAmount(o.buyerDebit, o.currency)}{" "}
                      {getTokenSymbol(o.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {o.kind === "collection_offer"
                        ? "Collection offer"
                        : "Token offer"}{" "}
                      · funds checked on acceptance
                    </p>
                  </div>
                  {ownership.effectiveIsOwner && (
                    <AcceptOffer order={o} tokenId={tokenId} />
                  )}
                </div>
              ))}
            {offers.isError&&<p role="alert">Offers are unavailable. Try again shortly.</p>}
            {offers.hasNextPage&&<Button variant="outline" disabled={offers.isFetchingNextPage} onClick={()=>void offers.fetchNextPage()}>More offers</Button>}
            {!offers.isPending&&!offers.isError&&!offerItems.some((o) => o.kind !== "listing") && (
              <p className="text-sm text-muted-foreground">No offers yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activityItems.length ? (
            activityItems.map((a) => (
              <div
                className="flex justify-between gap-4 border-b py-3 text-sm"
                key={a.id}
              >
                <span>{a.type.replaceAll("_", " ")}</span>
                <span className="text-muted-foreground">
                  {new Date(a.provenance.timestamp * 1000).toLocaleString()}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {activity.isPending?"Loading activity…":activity.isError?"Activity is unavailable. Try again shortly.":"No indexed activity yet."}
            </p>
          )}
        </CardContent>
      </Card>
      {activity.hasNextPage&&<Button variant="outline" disabled={activity.isFetchingNextPage} onClick={()=>void activity.fetchNextPage()}>More activity</Button>}
      <ReportToken collection={address} tokenId={tokenId} />
    </main>
  );
}
