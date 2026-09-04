// 당근마켓 파서 (서버 전용)
// 검색·상세 모두 페이지의 JSON-LD(schema.org)를 읽는다 — 마크업보다 안정적.
// 상세는 페이지에 임베디드된 아폴로 상태 JSON에서 닉네임·동네·카테고리·게시일·관심/채팅/조회·매너온도를 보강한다.
// 주의: 비공식 수집 — 구조 변경 시 보강 필드만 빠지고 기본 정보는 유지 (호출부에서 catch)

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
  return url.match(/-([A-Za-z0-9]+)\/?$/)?.[1] ?? url.split("/").filter(Boolean).pop() ?? "";
}

// JSON 문자열 리터럴 디코드 ("\n", "&" 등)
function jstr(s: string | undefined): string {
  if (!s) return "";
  try { return JSON.parse(`"${s}"`); } catch { return s; }
}

// 임베디드 JSON 안에서 anchor 앞쪽으로 가장 가까운 정규식 매치 (메인 글 필드는 recommendedArticles 직전에 모여 있다)
function lastBefore(html: string, anchor: number, re: RegExp): RegExpExecArray | null {
  const head = html.slice(Math.max(0, anchor - 200_000), anchor);
  let last: RegExpExecArray | null = null;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(head))) last = m;
  return last;
}

/** 메인 글의 맥락 필드 — 실패하면 빈 객체 (파서 전체가 죽지 않게) */
export function parseDaangnContext(html: string): Partial<MarketItemDetail> & { content?: string } {
  try {
    // 메인 글에만 있는 필드 순서: …"content":"…","favoriteCount":N,"chatCount":N,"viewCount":N,"recommendedArticles"
    const main = /"content":"((?:[^"\\]|\\.)*)","favoriteCount":(\d+),"chatCount":(\d+),"viewCount":(\d+),"recommendedArticles"/.exec(html);
    if (!main) return {};
    const anchor = main.index;
    const out: Partial<MarketItemDetail> & { content?: string } = {
      content: jstr(main[1]),
      counts: { favorites: Number(main[2]), chats: Number(main[3]), views: Number(main[4]) },
    };
    const created = lastBefore(html, anchor, /"createdAt":"([^"]+)","boostedAt":"([^"]*)"/);
    if (created) out.postedAt = created[2] || created[1];
    const cat = lastBefore(html, anchor, /"category":\{[^{}]*?"name":"((?:[^"\\]|\\.)*)"/);
    if (cat) out.category = jstr(cat[1]);
    const nick = lastBefore(html, anchor, /"nickname":"((?:[^"\\]|\\.)*)"/);
    if (nick) out.sellerName = jstr(nick[1]);
    const region = lastBefore(html, anchor, /"region":\{"name":"([^"]+)","name1":"([^"]*)","name2":"([^"]*)"/);
    if (region) out.region = [region[2], region[3], region[1]].filter(Boolean).join(" ");
    // 매너온도는 마크업에만 있다 — "41.2<!-- -->°C" 첫 등장 (React 텍스트 경계 주석 허용)
    const temp = /(\d{2}\.\d)(?:<!--\s*-->)?\s*°C/.exec(html);
    if (temp) out.sellerTemp = Number(temp[1]);
    // 판매자 페이지 + 판매자의 다른 글 (userArticles — 메인 글 앞쪽 user 객체 안)
    const userHref = lastBefore(html, anchor, /"href":"(https:\/\/www\.daangn\.com\/kr\/users\/[^"]+)"/);
    if (userHref) out.sellerUrl = jstr(userHref[1]);
    const ua = html.lastIndexOf('"userArticles":[', anchor);
    if (ua >= 0) {
      const seg = html.slice(ua, Math.min(anchor, ua + 60_000));
      const items: MarketItem[] = [];
      const re = /"id":"(\/kr\/buy-sell\/[^"]+)","title":"((?:[^"\\]|\\.)*)","price":"([^"]*)","thumbnail":"([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(seg)) && items.length < 8) {
        const url = `https://www.daangn.com${jstr(m[1])}`;
        items.push({
          source: "daangn", sourceId: idFromUrl(url), url, title: jstr(m[2]),
          price: Math.round(Number(m[3]) || 0), currency: "KRW",
          thumb: jstr(m[4]), soldOut: false,
        });
      }
      if (items.length) out.sellerItems = items;
    }
    return out;
  } catch {
    return {};
  }
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
  const ctx = parseDaangnContext(html);
  const used = /UsedCondition/i.test(String(p.offers?.itemCondition ?? ""));

  return {
    source: "daangn", sourceId: id,
    url: String(p.url ?? `https://www.daangn.com/kr/buy-sell/-${id}/`),
    title: String(p.name), price: Math.round(Number(p.offers?.price ?? 0)),
    currency: "KRW", thumb: images[0] ?? "",
    soldOut: /SoldOut|Discontinued/i.test(String(p.offers?.availability ?? "")),
    auction: false,
    // 임베디드 본문(줄바꿈 보존)이 JSON-LD 설명보다 완전하다
    description: (ctx.content || String(p.description ?? "")).slice(0, 2000),
    images, sellerName: ctx.sellerName || String(p.seller?.name ?? p.offers?.seller?.name ?? ""),
    condition: used ? "중고" : "",
    extra: {},
    region: ctx.region, category: ctx.category, postedAt: ctx.postedAt,
    sellerTemp: ctx.sellerTemp, counts: ctx.counts,
    sellerUrl: ctx.sellerUrl, sellerItems: ctx.sellerItems?.filter((i) => i.sourceId !== id),
  };
}
