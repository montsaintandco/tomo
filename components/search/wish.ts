// 해외 상품 찜(0038 external_wishlists) — API·카드·마이페이지가 같이 쓰는 순수 규칙. React·DB 없음.
import type { MarketSource } from "@/lib/market/types";
import type { Currency } from "@/lib/currency";

export const WISH_SOURCES: readonly MarketSource[] = ["mercari", "yahoo_auction", "yahoo_flea", "daangn", "joongna"];
export type ExternalWish = { source: MarketSource; sourceId: string; title: string; price: number; currency: Currency; thumb: string };

// 키 = "source:sourceId". 쉼표로 묶어 한 번에 조회하므로 ID 에 쉼표·콜론·공백·경로 문자는 없어야 한다
const ID = /^[^\s,:/?#]{1,120}$/;
export const MAX_KEYS = 100;

export const wishKey = (source: string, sourceId: string) => `${source}:${sourceId}`;

export function validSource(s: unknown): s is MarketSource {
  return typeof s === "string" && (WISH_SOURCES as readonly string[]).includes(s);
}
export function validId(s: unknown): s is string {
  return typeof s === "string" && ID.test(s);
}

/** "mercari:m123,daangn:abc" → 유효한 키만(중복 제거, 최대 100개) */
export function parseKeys(raw: string | null | undefined): { source: MarketSource; sourceId: string }[] {
  const out = new Map<string, { source: MarketSource; sourceId: string }>();
  for (const k of (raw ?? "").split(",")) {
    const i = k.indexOf(":");
    if (i < 0) continue;
    const source = k.slice(0, i), sourceId = k.slice(i + 1);
    if (validSource(source) && validId(sourceId)) out.set(k, { source, sourceId });
    if (out.size >= MAX_KEYS) break;
  }
  return [...out.values()];
}

/** 찜 요청 본문 → 저장할 스냅샷. 틀리면 null. 제목은 300자, 썸네일은 https 만(아니면 빈 값) */
export function parseWish(b: unknown): ExternalWish | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  if (!validSource(o.source) || !validId(o.sourceId)) return null;
  if (o.currency !== "KRW" && o.currency !== "JPY") return null;
  const price = Number(o.price);
  if (!Number.isFinite(price) || price < 0 || price > 2_000_000_000) return null;
  const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
  const thumb = typeof o.thumb === "string" && /^https:\/\//.test(o.thumb) && o.thumb.length <= 1000 ? o.thumb : "";
  return { source: o.source, sourceId: o.sourceId, title, price: Math.round(price), currency: o.currency, thumb };
}
