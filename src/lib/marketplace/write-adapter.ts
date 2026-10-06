export type AccountCall = {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
};
export type OrderKey = { maker: string; nonce: string };
const MAX = (1n << 256n) - 1n;
export function uint256(value: string | bigint): [string, string] {
  const n = BigInt(value);
  if (n < 0n || n > MAX) throw new Error("Amount exceeds uint256.");
  return [(n & ((1n << 128n) - 1n)).toString(), (n >> 128n).toString()];
}
export function parseAmount(input: string, decimals: number) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    !/^\d+(?:\.\d+)?$/.test(input)
  )
    throw new Error("Enter a positive decimal amount.");
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`);
  const value =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (value <= 0n || value > MAX) throw new Error("Amount is out of range.");
  return value.toString();
}
export function parseOrderKey(
  id: string,
  chain: string,
  marketplace: string,
): OrderKey {
  const [network, market, maker, nonce, ...rest] = id.split(":");
  if (
    rest.length ||
    network !== chain ||
    !maker ||
    !nonce ||
    BigInt(market) !== BigInt(marketplace) ||
    BigInt(nonce) < 1n ||
    BigInt(nonce) >= 1n << 64n
  )
    throw new Error("Order belongs to another deployment. Refresh your cart.");
  return { maker, nonce: BigInt(nonce).toString() };
}
export function buildBuyMany(
  marketplace: string,
  keys: OrderKey[],
  currency: string,
  total: string,
  deadline: number,
): AccountCall {
  if (!keys.length || keys.length > 25)
    throw new Error("Choose 1–25 listings.");
  if (
    new Set(keys.map((k) => `${BigInt(k.maker)}:${BigInt(k.nonce)}`)).size !==
    keys.length
  )
    throw new Error("Duplicate listing.");
  return {
    contractAddress: marketplace,
    entrypoint: "buy_many",
    calldata: [
      String(keys.length),
      ...keys.flatMap((k) => [k.maker, k.nonce]),
      currency,
      ...uint256(total),
      String(deadline),
    ],
  };
}
export function buildCreateOrder(o: {
  marketplace: string;
  kind: "listing" | "token_offer" | "collection_offer";
  collection: string;
  tokenId?: string;
  currency: string;
  price: string;
  expiry: number;
  royaltyCap: string;
}): AccountCall {
  return {
    contractAddress: o.marketplace,
    entrypoint: {
      listing: "create_listing",
      token_offer: "create_offer",
      collection_offer: "create_collection_offer",
    }[o.kind],
    calldata: [
      o.collection,
      ...(o.kind === "collection_offer" ? [] : uint256(o.tokenId ?? "")),
      o.currency,
      ...uint256(o.price),
      String(o.expiry),
      ...uint256(o.royaltyCap),
    ],
  };
}
export function buildApproval(
  currency: string,
  marketplace: string,
  amount: string,
): AccountCall {
  return {
    contractAddress: currency,
    entrypoint: "approve",
    calldata: [marketplace, ...uint256(amount)],
  };
}
export function buildNftApproval(
  collection: string,
  marketplace: string,
  tokenId: string,
): AccountCall {
  return {
    contractAddress: collection,
    entrypoint: "approve",
    calldata: [marketplace, ...uint256(tokenId)],
  };
}
export function buildCancel(marketplace: string, nonce: string): AccountCall {
  return {
    contractAddress: marketplace,
    entrypoint: "cancel_order",
    calldata: [nonce],
  };
}
export function parseRoyaltyBps(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Use a royalty percentage with at most two decimals.");
  const [whole, fraction = ""] = value.split(".");
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (bps > 5000n) throw new Error("Royalty cap must be between 0 and 50%.");
  return bps;
}
