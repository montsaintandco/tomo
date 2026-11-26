// 가격 표기 — 모든 카드·가격 줄의 유일한 계산처 (05-roadmap T1, 키라팝 lib/price-display 원칙 차용).
// 큰 줄 = 보는 사람 통화(다른 통화면 「약」), 작은 줄 = 원래 통화. 순수 함수만. 화면은 components/ui/Price.tsx.
// 환산은 lib/currency convertPrice(Math.round, 1단위) 그대로 — 장바구니·주문서(lib/fees proxyOrderTotal)와 같은 숫자가 나와야 한다.
// 환율 구성(마진)은 어디에도 드러내지 않는다. 결과 금액만 쓴다.
import { convertPrice, type Currency } from "./currency";
import { t, type Lang } from "./i18n";

const HOME: Record<Lang, Currency> = { ko: "KRW", ja: "JPY" };

/** 천 단위 쉼표 — 서버·브라우저가 같은 글자를 내도록 직접 끊는다 */
export function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 화면 언어에 맞춘 금액 글자. 일본어 화면의 원화는 「원」 대신 ₩ (비로그인 ja 화면에 「원」이 없어야 한다) */
export function formatMoney(amount: number, currency: Currency, lang: Lang): string {
  const n = groupThousands(amount);
  if (currency === "JPY") return `¥${n}`;
  return lang === "ja" ? `₩${n}` : `${n}원`;
}

export type PriceInput = {
  amount: number; currency: Currency;
  /** 보는 사람 통화(로그인=거주국, 비로그인=화면 언어) */
  viewerCurrency: Currency;
  /** 원래 통화 → 보는 사람 통화 환율 */
  rate: number;
  lang: Lang;
  /** 작은 줄 앞 라벨 — 경매 「현재가」 */
  label?: string | null;
};

export type PriceParts = {
  /** 큰 줄 — 「약 18,900원」 또는 같은 통화면 「¥2,100」 */
  main: string;
  /** 작은 줄 — 「현재가 ¥2,100」 / 「¥2,100」 / 라벨만 / null */
  sub: string | null;
  /** 화면 언어의 기본 통화와 큰 줄 통화가 다르면 그 통화 코드(작게 붙인다). 같으면 null */
  tag: Currency | null;
  /** 큰 줄 숫자(보는 사람 통화) */
  value: number;
};

/** 금액이 0 이하·숫자가 아니면 null — 화면은 대체 글(나눔·가격 확인 필요)을 쓴다 */
export function priceParts({ amount, currency, viewerCurrency, rate, lang, label }: PriceInput): PriceParts | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const tag0 = label?.trim() || null;
  const same = currency === viewerCurrency;
  // 환율이 없으면(0·NaN) 환산하지 않고 원래 통화를 큰 줄로 올린다
  const canConvert = !same && Number.isFinite(rate) && rate > 0;
  const mainCur = canConvert ? viewerCurrency : currency;
  const value = canConvert ? convertPrice(amount, currency, rate) : amount;
  const original = formatMoney(amount, currency, lang);
  const main = canConvert ? `${t(lang, "price.approx")} ${formatMoney(value, viewerCurrency, lang)}` : original;
  const sub = canConvert ? (tag0 ? `${tag0} ${original}` : original) : tag0;
  return { main, sub, tag: HOME[lang] === mainCur ? null : mainCur, value };
}
