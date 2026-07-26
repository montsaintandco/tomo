// 당근마켓 파서 (서버 전용)
// 검색·상세 모두 페이지의 JSON-LD(schema.org)를 읽는다 — 마크업보다 안정적.
// 주의: 비공식 수집 — 구조 변경 시 빈 결과로 degrade (호출부에서 catch)

/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithRetry } from "./http";
import type { MarketItem, MarketItemDetail } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchHtml(url: string, revalidate = 300): Promise<string> {
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", Accept: "text/html,application/xhtml+xml" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Daangn ${res.status}`);
  return res.text();
}

function jsonLdBlocks(html: string): any[] {
  const out: any[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try { out.push(JSON.parse(m[1])); } catch { /* 깨진 블록은 무시 */ }
  }
  return out;
}

// 상품 URL 끝의 숫자 id (…-슬러그-123456789/)
function idFromUrl(url: string): string {
  return url.match(/-(\d+)\/?$/)?.[1] ?? url.split("/").filter(Boolean).pop() ?? "";
}

export async function daangnSearch(keyword: string): Promise<MarketItem[]> {
  const html = await fetchHtml(
    `https://www.daangn.com/kr/buy-sell/?search=${encodeURIComponent(keyword)}`);
  const list = jsonLdBlocks(html).find((b) => b?.["@type"] === "ItemList");
  const elements: any[] = list?.itemListElement ?? [];

  const items: MarketItem[] = [];
  for (const el of elements) {
    const p = el?.item;
    if (!p?.name || !p?.url) continue;
    const price = Math.round(Number(p.offers?.price ?? 0));
    if (!Number.isFinite(price)) continue;
    const image = Array.isArray(p.image) ? p.image[0] : p.image;
    items.push({
      source: "daangn", sourceId: idFromUrl(String(p.url)),
      url: String(p.url), title: String(p.name),
      price, currency: "KRW",
      thumb: typeof image === "string" ? image : "",
      soldOut: /SoldOut|Discontinued/i.test(String(p.offers?.availability ?? "")),
    });
    if (items.length >= 40) break;
  }
  return items;
}

export async function daangnItem(id: string): Promise<MarketItemDetail> {
  // 상세 URL은 슬러그를 포함하지만 id만으로도 리다이렉트된다
  const html = await fetchHtml(`https://www.daangn.com/kr/buy-sell/-${id}/`, 120);
  const blocks = jsonLdBlocks(html);
  const p = blocks.find((b) => b?.["@type"] === "Product");
  if (!p?.name) throw new Error("상품 정보를 찾을 수 없어요");

  const images = (Array.isArray(p.image) ? p.image : [p.image]).filter(
    (x: unknown): x is string => typeof x === "string").slice(0, 8);

  return {
    source: "daangn", sourceId: id,
    url: String(p.url ?? `https://www.daangn.com/kr/buy-sell/-${id}/`),
    title: String(p.name), price: Math.round(Number(p.offers?.price ?? 0)),
    currency: "KRW", thumb: images[0] ?? "",
    soldOut: /SoldOut|Discontinued/i.test(String(p.offers?.availability ?? "")),
    auction: false,
    description: String(p.description ?? "").slice(0, 800),
    images, sellerName: String(p.seller?.name ?? ""),
    condition: "",
    extra: { 지역: String(p.offers?.areaServed ?? p.areaServed ?? "") },
  };
}
