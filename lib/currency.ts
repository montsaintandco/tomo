export type Currency = "KRW" | "JPY";

export function convertPrice(amount: number, from: Currency, rate: number): number {
  return Math.round(amount * rate);
}

// lang=ja 이면 원화를 「₩12,345」로(일본어 화면에 한국어 「원」이 섞이지 않게, 2026-11-26 QA). 기본은 ko 표기 그대로
export function formatPrice(amount: number, currency: Currency, lang: "ko" | "ja" = "ko"): string {
  const n = amount.toLocaleString("en-US");
  if (currency === "JPY") return `¥${n}`;
  return lang === "ja" ? `₩${n}` : `${n}원`;
}

export function formatWithConversion(
  amount: number, currency: Currency, rate: number, viewerCurrency: Currency
): string {
  const base = formatPrice(amount, currency);
  if (currency === viewerCurrency) return base;
  const converted = convertPrice(amount, currency, rate);
  return `${base} (약 ${formatPrice(converted, viewerCurrency)})`;
}
