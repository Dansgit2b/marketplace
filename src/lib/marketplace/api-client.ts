import { getMarketplaceRuntimeConfig } from "./config";
import type {
  ApiCollection,
  ApiOrder,
  ApiPage,
  ApiToken,
  CollectionOrdersOptions,
  CollectionSummaryOptions,
  FetchCollectionTokensOptions,
  FetchTokenBalancesOptions,
  FetchTokenBalancesResult,
  MarketplaceOrder,
  NormalizedToken,
  TokenDetailsOptions,
} from "./types";
export const DEFAULT_CURRENCY =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
export class MarketplaceApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function marketplaceRequest<T>(
  path: string,
  query: Record<string, unknown> = {},
  body?: unknown,
): Promise<T> {
  const chain = getMarketplaceRuntimeConfig().chainLabel;
  const base =
    typeof window === "undefined"
      ? (process.env.MARKETPLACE_API_URL ?? "http://127.0.0.1:3100")
      : (process.env.NEXT_PUBLIC_MARKETPLACE_API_BASE ?? "/api/marketplace");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== null)
      params.set(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
  const response = await fetch(
    `${base}/v1/chains/${chain}${path}${params.size ? "?" + params : ""}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  const payload = await response.json();
  if (!response.ok)
    throw new MarketplaceApiError(
      payload.error?.message ?? "Marketplace request failed",
      payload.error?.code ?? "API_ERROR",
      response.status,
    );
  return payload.data as T;
}
export function tokenFromApi(t: ApiToken): NormalizedToken {
  return {
    amountsInBaseUnits: true,
    contract_address: t.collection,
    token_id: t.tokenId,
    owner: t.owner,
    total_supply: "1",
    image: t.image ?? String(t.metadata?.image ?? ""),
    metadata: {
      ...t.metadata,
      attributes: t.attributes.map((a) => ({
        trait_type: a.name,
        value: a.value,
      })),
    },
    ...(t.bestListing
      ? {
          best_listing: orderFromApi(t.bestListing),
          price: t.bestListing.buyerDebit,
          currency: t.bestListing.currency,
        }
      : {}),
  };
}
export function orderFromApi(o: ApiOrder): MarketplaceOrder {
  return {
    id: o.id,
    maker: o.maker,
    nonce: o.nonce,
    collection: o.collection,
    tokenId: o.tokenId,
    token_id: o.tokenId,
    owner: o.maker,
    currency: o.currency,
    price: o.buyerDebit,
    quantity: "1",
    expiration: o.expiry,
    status: { open: "placed", filled: "executed", cancelled: "canceled" }[
      o.state
    ],
    category: o.kind === "listing" ? "Sell" : "Buy",
    kind: o.kind,
    apiOrder: o,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
export function collectionFromApi(c: ApiCollection) {
  return {
    ...c,
    metadata: { name: c.name, description: c.description, image: c.image },
    totalSupply: c.tokenCount,
  };
}
const val = (v: string) =>
  v === "true"
    ? true
    : v === "false"
      ? false
      : /^\d+$/.test(v) && Number.isSafeInteger(Number(v))
        ? Number(v)
        : v;
export async function fetchCollectionTokens(o: FetchCollectionTokensOptions) {
  const filters =
    o.filters ??
    Object.entries(o.attributeFilters ?? {}).map(([name, values]) => ({
      name,
      values: values.map(val),
    }));
  const page = await marketplaceRequest<ApiPage<ApiToken>>(
    `/collections/${o.address}/tokens`,
    {
      limit: Math.min(o.limit ?? 24, 100),
      cursor: o.cursor,
      tokenIds: o.tokenIds?.map((x) =>
        BigInt(x.includes(":") ? x.split(":").at(-1)! : x).toString(),
      ),
      filters,
      sort: o.sort ?? "token-asc",
      currency: o.currency ?? DEFAULT_CURRENCY,
    },
  );
  return {
    page: { tokens: page.items.map(tokenFromApi), nextCursor: page.nextCursor },
    error: null,
  };
}
export async function fetchTokenBalances(
  o: FetchTokenBalancesOptions,
): Promise<FetchTokenBalancesResult> {
  if (!o.accountAddresses?.[0]) {
    if (!o.contractAddresses?.[0] || !o.tokenIds?.[0])
      return { page: { balances: [], nextCursor: null }, error: null };
    const token = await marketplaceRequest<ApiToken>(
      `/tokens/${o.contractAddresses[0]}/${BigInt(o.tokenIds[0])}`,
    );
    return {
      page: {
        balances: BigInt(token.owner)
          ? [
              {
                contract_address: token.collection,
                token_id: token.tokenId,
                account_address: token.owner,
                balance: "1",
              },
            ]
          : [],
        nextCursor: null,
      },
      error: null,
    };
  }
  const page = await marketplaceRequest<ApiPage<ApiToken>>(
    `/accounts/${o.accountAddresses[0]}/holdings`,
    {
      collection: o.contractAddresses?.length===1?o.contractAddresses[0]:undefined,
      collections:o.contractAddresses&&o.contractAddresses.length>1?o.contractAddresses:undefined,
      tokenIds: o.tokenIds,
      limit: Math.min(o.limit ?? 100, 100),
      cursor: o.cursor,
    },
  );
  return {
    page: {
      balances: page.items.map((t) => ({
        contract_address: t.collection,
        token_id: t.tokenId,
        account_address: t.owner,
        balance: "1",
        token: tokenFromApi(t),
      })),
      nextCursor: page.nextCursor,
    },
    error: null,
  };
}
type Facet = {
  name: string;
  kind: string;
  values: Array<{ value: string | number | boolean; count: string }>;
};
export async function fetchTraitNamesSummary(o: {
  address: string;
  defaultProjectId?: string;
}) {
  const facets = await marketplaceRequest<Facet[]>(
    `/collections/${o.address}/traits`,
  );
  return {
    pages: [
      {
        projectId: "owned",
        traits: facets.map((f) => ({
          traitName: f.name,
          valueCount: f.values.length,
        })),
      },
    ],
    errors: [],
  };
}
export async function fetchTraitValues(o: {
  address: string;
  traitName: string;
  otherTraitFilters?: Array<{ name: string; value: string }>;
  defaultProjectId?: string;
}) {
  const map = new Map<string, string[]>();
  for (const f of o.otherTraitFilters ?? [])
    map.set(f.name, [...(map.get(f.name) ?? []), f.value]);
  const facets = await marketplaceRequest<Facet[]>(
    `/collections/${o.address}/traits/${encodeURIComponent(o.traitName)}`,
    {
      filters: [...map].map(([name, values]) => ({
        name,
        values: values.map(val),
      })),
    },
  );
  return {
    pages: [
      {
        projectId: "owned",
        values: (facets[0]?.values ?? []).map((v) => ({
          traitValue: String(v.value),
          count: Number(v.count),
        })),
      },
    ],
    errors: [],
  };
}
export const ownedClient = {
  async getCollection(o: CollectionSummaryOptions) {
    return collectionFromApi(
      await marketplaceRequest<ApiCollection>(`/collections/${o.address}`),
    );
  },
  async getToken(o: TokenDetailsOptions) {
    const t = await marketplaceRequest<ApiToken>(
      `/tokens/${o.collection}/${BigInt(o.tokenId.includes(":") ? o.tokenId.split(":").at(-1)! : o.tokenId)}`,
    );
    return {
      token: tokenFromApi(t),
      listings: (t.listings ?? []).map(orderFromApi),
    };
  },
  async getCollectionOrders(o: CollectionOrdersOptions) {
    const page = await marketplaceRequest<ApiPage<ApiOrder>>(
      `/collections/${o.collection}/orders`,
      {
        limit: Math.min(o.limit ?? 100, 100),
        cursor: o.cursor,
        tokenId: o.tokenId,
        currency: o.currency ?? DEFAULT_CURRENCY,
        state: o.status
          ? {
              Placed: "open",
              Canceled: "cancelled",
              Executed: "filled",
              None: undefined,
            }[o.status]
          : undefined,
        kind:
          o.category === "Sell"
            ? "listing"
            : o.category === "Buy"
              ? "token_offer"
              : undefined,
      },
    );
    return page.items.map(orderFromApi);
  },
  async listCollectionListings(o: CollectionOrdersOptions) {
    const page = await marketplaceRequest<ApiPage<ApiOrder>>(
      `/collections/${o.collection}/listings`,
      {
        limit: Math.min(o.limit ?? 100, 100),
        tokenId: o.tokenId,
        currency: o.currency ?? DEFAULT_CURRENCY,
        cursor: o.cursor,
      },
    );
    return page.items.map(orderFromApi);
  },
  async getFees() {
    const c = await marketplaceRequest<{
      feeBps: number;
      feeRecipient: string;
    }>("/marketplace/config");
    return {
      feeNum: c.feeBps,
      feeDenominator: 10000,
      feeReceiver: c.feeRecipient,
    };
  },
};
export async function createMarketplaceClient() {
  return ownedClient;
}
