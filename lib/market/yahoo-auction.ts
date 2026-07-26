// 야후옥션(ヤフオク·플리마 포함) 파서 (서버 전용) — tokyobuy lib/auction-server.ts 축약 이식
// 검색: search HTML의 <li class="Product"> data-auction-* 속성. 상세: __NEXT_DATA__ JSON
// 주의: 사이트 구조 변경에 취약 — 실패는 호출부에서 빈 결과 처리

/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithRetry } from "./http";
import type { MarketItem, MarketItemDetail } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9", Accept: "text/html,application/xhtml+xml" },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`Yahoo Auction ${res.status}`);
  return res.text();
}

function extractNextData(html: string): any {
  const i = html.indexOf("__NEXT_DATA__");
  if (i < 0) throw new Error("야후 응답 형식 변경");
  const start = html.indexOf("{", i);
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return JSON.parse(html.slice(start, j + 1)); }
  }
  throw new Error("야후 데이터 추출 실패");
}

function attr(block: string, name: string): string {
  const m = block.match(new RegExp(`data-auction-${name}="([^"]*)"`));
  return m ? m[1] : "";
}

export async function yahooAuctionSearch(keyword: string, page = 1): Promise<MarketItem[]> {
  const b = page > 1 ? `&b=${(page - 1) * 50 + 1}` : "";
  // 정액(즉구·플리마) 위주 노출을 위해 추천 정렬
  const html = await fetchHtml(
    `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(keyword)}&n=50&s1=score2&o1=d${b}`);
  const items: MarketItem[] = [];
  const seen = new Set<string>();
  const blocks = html.split('<li class="Product"');
  for (let bi = 1; bi < blocks.length && items.length < 40; bi++) {
    const block = blocks[bi].slice(0, 9000);
    const id = attr(block, "id");
    const title = attr(block, "title");
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const buyNow = Number(attr(block, "buynowprice")) || 0;
    const price = buyNow > 0 ? buyNow : Number(attr(block, "price")) || 0;
    const isFlea = attr(block, "isflea") !== "";
    items.push({
      source: "yahoo_auction", sourceId: id,
      url: `https://auctions.yahoo.co.jp/jp/auction/${id}`,
      title, price, currency: "JPY",
      thumb: attr(block, "img"), soldOut: false,
      // 즉시구매가도 플리마도 아니면 입찰형 — 표시가는 현재가(낙찰가 미확정)
      auction: !isFlea && buyNow === 0,
    });
  }
  return items;
}

function findItem(o: any): any {
  if (o && typeof o === "object") {
    if (typeof o.auctionId === "string" && typeof o.title === "string" && ("price" in o || "initPrice" in o)) return o;
    for (const v of Array.isArray(o) ? o : Object.values(o)) {
      const r = findItem(v);
      if (r) return r;
    }
  }
  return null;
}

export async function yahooAuctionItem(id: string): Promise<MarketItemDetail> {
  if (!/^[a-zA-Z]?\d{5,}$/.test(id) && !/^[a-zA-Z]\d{5,}$/.test(id)) throw new Error("잘못된 상품 번호");
  const html = await fetchHtml(`https://auctions.yahoo.co.jp/jp/auction/${id}`);
  const j = extractNextData(html);
  const item = findItem(j?.props?.pageProps ?? j);
  if (!item?.title) throw new Error("상품 정보를 찾을 수 없어요 (종료됐을 수 있어요)");

  const images: string[] = [];
  for (const im of item.img ?? []) {
    const u = typeof im === "string" ? im : im?.image ?? im?.url;
    if (u && !images.includes(u) && images.length < 8) images.push(u);
  }
  const buyNow = (() => {
    for (const k of Object.keys(item)) {
      if (/bidorbuy/i.test(k)) {
        const v = Number(item[k]);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    return 0;
  })();
  const price = buyNow > 0 ? buyNow : Number(item.taxinPrice) || Number(item.price) || 0;

  return {
    source: "yahoo_auction", sourceId: item.auctionId ?? id,
    url: `https://auctions.yahoo.co.jp/jp/auction/${item.auctionId ?? id}`,
    title: String(item.title), price, currency: "JPY",
    thumb: images[0] ?? "", soldOut: Boolean(item.isClosed),
    auction: !item.isFleaMarket && buyNow === 0,
    description: (Array.isArray(item.description) ? item.description.join("\n") : String(item.description ?? "")).slice(0, 800),
    images, sellerName: String(item.seller?.displayName ?? item.seller?.id ?? ""),
    condition: String(item.conditionName ?? ""),
    extra: {
      형태: item.isFleaMarket ? "플리마(정액)" : buyNow > 0 ? "경매+즉시구매" : "경매",
      입찰수: String(item.bids ?? 0),
    },
  };
}
