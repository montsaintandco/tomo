export type Currency = "KRW" | "JPY";

export function convertPrice(amount: number, from: Currency, rate: number): number {
  return Math.round(amount * rate);
}

export function formatPrice(amount: number, currency: Currency): string {
  const n = amount.toLocaleString("en-US");
  return currency === "JPY" ? `¥${n}` : `${n}원`;
}

export function formatWithConversion(
  amount: number, currency: Currency, rate: number, viewerCurrency: Currency
): string {
  const base = formatPrice(amount, currency);
  if (currency === viewerCurrency) return base;
  const converted = convertPrice(amount, currency, rate);
  return `${base} (약 ${formatPrice(converted, viewerCurrency)})`;
}
