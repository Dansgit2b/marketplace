const decimalsByCurrency = new Map<string, number>();
export function configureCurrencyDecimals(
  currencies: Array<{ address: string; decimals: number }>,
) {
  for (const c of currencies)
    decimalsByCurrency.set(BigInt(c.address).toString(), c.decimals);
}
/** Chain amounts are always base units. Never guess their scale from digit count. */
export function formatCurrencyAmount(
  amount: string | bigint | undefined,
  currency?: string,
  decimals?: number,
) {
  if (amount === undefined) return "—";
  const scale =
    decimals ??
    (currency
      ? decimalsByCurrency.get(BigInt(currency).toString())
      : undefined) ??
    18;
  if (!Number.isInteger(scale) || scale < 0 || scale > 36)
    throw new Error("Invalid currency decimals.");
  const n = BigInt(amount),
    absolute = n < 0n ? -n : n,
    divisor = 10n ** BigInt(scale),
    fraction = (absolute % divisor)
      .toString()
      .padStart(scale, "0")
      .replace(/0+$/, "");
  return `${n < 0n ? "-" : ""}${absolute / divisor}${fraction ? "." + fraction : ""}`;
}
