// 중고나라 파서 (서버 전용)
// 검색: 상품 카드(<a href="/product/{id}">) 블록에서 제목·가격·이미지 추출.
// 주의: 마크업 의존 — 사이트 개편 시 깨질 수 있어 방어적으로 파싱하고, 못 읽으면 그 항목만 건너뛴다.

import { fetchWithRetry } from "./http";
import type { MarketItem, MarketItemDetail } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchHtml(url: string, revalidate = 300): Promise<string> {
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9", Accept: "text/html,application/xhtml+xml" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`Joongna ${res.status}`);
  return res.text();
}

// 태그·SVG 제거 후 순수 텍스트
function textOf(html: string): string {
  return html.replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function joongnaSearch(keyword: string): Promise<MarketItem[]> {
  const html = await fetchHtml(`https://web.joongna.com/search/${encodeURIComponent(keyword)}`);
  const blocks = html.split(/<a[^>]*href="\/product\//).slice(1);

  const items: MarketItem[] = [];
  const seen = new Set<string>();
  for (const raw of blocks) {
    if (items.length >= 40) break;
    const id = raw.match(/^(\d+)/)?.[1];
    if (!id || seen.has(id)) continue;

    const chunk = raw.slice(0, 6000);
    const text = textOf(chunk).replace(/^\d+"?>?\s*/, ""); // 앞부분 id 잔여 제거
    // "12,000 원" 형태의 첫 가격
    const priceMatch = text.match(/([0-9][0-9,]{2,})\s*원/);
    if (!priceMatch) continue;
    const price = Number(priceMatch[1].replace(/,/g, ""));
    if (!Number.isFinite(price) || price <= 0) continue;

    // 제목: 가격 앞부분에서 배지(안심결제 등) 제거
    const title = text.slice(0, priceMatch.index ?? 0)
      .replace(/안심결제|무료배송|배송비포함|판매완료|예약중/g, "")
      .trim();
    if (!title) continue;

    const thumb = chunk.match(/https:\/\/img\d*\.joongna\.com[^"'\s]+/)?.[0] ?? "";
    seen.add(id);
    items.push({
      source: "joongna", sourceId: id,
      url: `https://web.joongna.com/product/${id}`,
      title: title.slice(0, 120), price, currency: "KRW",
      thumb, soldOut: /판매완료/.test(text),
    });
  }
  return items;
}

// Next 플라이트 데이터(self.__next_f)에 이중 이스케이프된 상품 JSON이 들어 있다.
// 해당 상품 세그먼트를 잘라 원래 JSON 텍스트로 되돌린 뒤 필드를 읽는다. 실패하면 빈 객체 (메타태그 폴백 유지)
export function parseJoongnaContext(html: string, id: string): Partial<MarketItemDetail> & { title?: string; price?: number } {
  try {
    const at = html.indexOf(`\\"productSeq\\":${id},`);
    if (at < 0) return {};
    const seg = html.slice(at, at + 80_000);
    // 플라이트 문자열 리터럴 → 원본 JSON 텍스트
    const json = seg.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, c: string) => {
      if (c[0] === "u") return String.fromCharCode(parseInt(c.slice(1), 16));
      return ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c;
    });
    const str = (key: string) => {
      const m = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`).exec(json);
      if (!m) return "";
      try { return JSON.parse(`"${m[1]}"`) as string; } catch { return m[1]; }
    };
    const num = (key: string) => { const m = new RegExp(`"${key}":(\\d+)`).exec(json); return m ? Number(m[1]) : undefined; };

    const out: Partial<MarketItemDetail> & { title?: string; price?: number } = {};
    out.title = str("productTitle") || undefined;
    out.description = str("productDescription") || undefined;
    out.sellerName = str("nickName") || undefined;
    out.region = str("locationName") || undefined;
    const cat = str("categoryName");
    if (cat) out.category = cat.split(",").map((x) => x.trim()).filter(Boolean).join(" › ");
    const sort = str("sortDate");
    if (sort) out.postedAt = sort.replace(" ", "T") + "+09:00";
    out.price = num("productPrice");
    const views = num("viewCount");
    if (views != null) out.counts = { views };
    const media = Array.from(json.matchAll(/"(?:originUrl|mediaUrl)":"(https:[^"]+)"/g)).map((m) => m[1]);
    const images = Array.from(new Set(media.filter((u) => /joongna\.com\/media/.test(u)))).slice(0, 8);
    if (images.length) out.images = images;
    const labels = /"labels":\[([^\]]*)\]/.exec(json)?.[1];
    const tags = labels ? Array.from(labels.matchAll(/"([^"]+)"/g)).map((m) => m[1]) : [];
    const trade = /"tradeType":\{"isPost":(true|false),"isMeet":(true|false),"isPickup":(true|false)\}/.exec(json);
    if (trade) {
      if (trade[1] === "true" && !tags.includes("택배거래")) tags.push("택배거래");
      if (trade[2] === "true" && !tags.includes("직거래")) tags.push("직거래");
    }
    if (/"isSafePayment":true/.test(json) && !tags.includes("안전결제")) tags.push("안전결제");
    if (tags.length) out.tradeTags = tags;
    const cond = /"productCondition":(\d)/.exec(json)?.[1];
    if (cond != null) out.condition = tags.includes("새상품") ? "새상품" : cond === "0" ? "중고" : "";
    return out;
  } catch {
    return {};
  }
}

export async function joongnaItem(id: string): Promise<MarketItemDetail> {
  if (!/^\d+$/.test(id)) throw new Error("잘못된 상품 번호");
  const html = await fetchHtml(`https://web.joongna.com/product/${id}`, 120);

  // 메타태그가 가장 안정적인 소스
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1]
    ?? "";

  const ctx = parseJoongnaContext(html, id);
  const title = ctx.title || meta("og:title") || textOf(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
  if (!title) throw new Error("상품 정보를 찾을 수 없어요");

  const description = ctx.description ?? meta("og:description");
  const image = meta("og:image");
  // 가격: 플라이트 JSON → 본문 텍스트의 첫 "N원"
  const price = ctx.price ?? Number((textOf(html).match(/([0-9][0-9,]{2,})\s*원/)?.[1] ?? "0").replace(/,/g, ""));
  const images = ctx.images?.length ? ctx.images : image ? [image] : [];

  return {
    source: "joongna", sourceId: id,
    url: `https://web.joongna.com/product/${id}`,
    title: title.replace(/\s*[|-]\s*중고나라.*$/, "").slice(0, 120),
    price: Number.isFinite(price) ? price : 0,
    currency: "KRW", thumb: images[0] ?? image,
    soldOut: /판매완료/.test(html),
    auction: false,
    description: description.slice(0, 2000),
    images,
    sellerName: ctx.sellerName ?? "", condition: ctx.condition ?? "", extra: {},
    region: ctx.region, category: ctx.category, postedAt: ctx.postedAt,
    counts: ctx.counts, tradeTags: ctx.tradeTags,
  };
}
