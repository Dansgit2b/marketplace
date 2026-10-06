export type NormalizedToken = {
  contract_address: string;
  token_id: string;
  metadata: unknown;
  image?: string | null;
  total_supply?: string;
  owner?: string | null;
  best_listing?: MarketplaceOrder;
  [key: string]: unknown;
};
export type ApiToken = {
  id: string;
  collection: string;
  tokenId: string;
  owner: string;
  metadata: Record<string, unknown>;
  attributes: Array<{ name: string; value: string | number | boolean }>;
  image?: string | null;
  bestListing?: ApiOrder;
  listings?: ApiOrder[];
  metadataStatus?: string;
};
export type ApiOrder = {
  id: string;
  maker: string;
  nonce: string;
  kind: "listing" | "token_offer" | "collection_offer";
  state: "open" | "filled" | "cancelled";
  availability?: string;
  collection: string;
  tokenId: string | null;
  currency: string;
  buyerDebit: string;
  expiry: string;
  royaltyAmount: string;
  royaltyCap: string;
  royaltyRecipient: string;
  createdAt?: { timestamp: number };
  updatedAt?: { timestamp: number };
};
export type MarketplaceOrder = {
  id: string;
  maker: string;
  nonce: string;
  collection: string;
  tokenId: string | null;
  token_id: string | null;
  owner: string;
  currency: string;
  price: string;
  quantity: string;
  expiration: string;
  status: string;
  category: string;
  kind: ApiOrder["kind"];
  apiOrder: ApiOrder;
  createdAt?: unknown;
  updatedAt?: unknown;
};
export type ApiCollection = {
  address: string;
  name: string;
  description?: string;
  image?: string | null;
  verified?: boolean;
  tokenCount: string;
  listingCount: string;
  floorByCurrency: Array<{ currency: string; symbol: string; price: string }>;
};
export type ApiPage<T> = { items: T[]; nextCursor: string | null };
export type IndexStatus = {
  chain: string;
  marketplace: string | null;
  indexedBlock: number | null;
  chainHead: number | null;
  lagBlocks: number | null;
  observedAt: number | null;
  generation: number;
  safeForCheckout: boolean;
  reasons: string[];
};
export type MarketConfig = {
  chain: string;
  chainId: string;
  marketplace: string | null;
  feeBps: number;
  feeRecipient: string;
  paused: boolean;
  demo: boolean;
  currencies: Array<{ address: string; symbol: string; decimals: number }>;
  collections: Array<{ address: string; name: string }>;
  status: IndexStatus;
};
export type CollectionSummaryOptions = {
  address: string;
  projectId?: string;
  fetchImages?: boolean;
};
export type FetchCollectionTokensOptions = {
  address: string;
  project?: string;
  cursor?: string | null;
  limit?: number;
  tokenIds?: string[];
  fetchImages?: boolean;
  attributeFilters?: Record<string, string[]>;
  filters?: Array<{
    name: string;
    values?: Array<string | number | boolean>;
    min?: number;
    max?: number;
  }>;
  sort?: string;
  currency?: string;
};
export type CollectionOrdersOptions = {
  collection: string;
  projectId?: string;
  tokenId?: string;
  limit?: number;
  cursor?: string;
  status?: "None" | "Placed" | "Canceled" | "Executed";
  category?: "None" | "Buy" | "Sell";
  currency?: string;
  verifyOwnership?: boolean;
  orderIds?: string[];
};
export type CollectionListingsOptions = CollectionOrdersOptions;
export type TokenDetailsOptions = {
  collection: string;
  tokenId: string;
  projectId?: string;
  fetchImages?: boolean;
};
export type TokenDetails = {
  token: NormalizedToken;
  listings: MarketplaceOrder[];
};
export type FetchTokenBalancesOptions = {
  project?: string;
  contractAddresses?: string[];
  accountAddresses?: string[];
  tokenIds?: string[];
  cursor?: string | null;
  limit?: number;
  defaultProjectId?: string;
};
export type FetchTokenBalancesResult = {
  page: {
    balances: Array<{
      contract_address: string;
      token_id: string;
      account_address: string;
      balance: string;
      token?: NormalizedToken;
    }>;
    nextCursor: string | null;
  } | null;
  error: null;
};
export type MarketplaceClientConfig = {
  chainId: string;
  defaultProject?: string;
  runtime?: "edge" | "dojo";
};
export type MarketplaceClientStatus = "ready" | "loading" | "error";
