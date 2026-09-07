// Yahoo!フリマ(旧 PayPayフリマ, paypayfleamarket.yahoo.co.jp) 파서 (서버 전용) — 야후옥션과 별개 사이트·별개 소스.
// 검색: 공개 JSON API /api/v1/search (정렬·가격 필터 지원). 상세: 상품 페이지 __NEXT_DATA__ initialState.itemsState.items.item
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithRetry } from "./http";
import type { SearchFilters, MarketItem, MarketItemDetail } from "./types";

const BASE = "https://paypayfleamarket.yahoo.co.jp";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9" };

// 검색 API 응답 항목 → 카드. itemStatus SOLD = 판매완료. 옥션 아님(정액)
function toItem(it: any): MarketItem {
  return {
    source: "yahoo_flea", sourceId: String(it.id), url: `${BASE}/item/${it.id}`,
    title: String(it.title ?? ""), price: Number(it.price) || 0, currency: "JPY",
    thumb: String(it.thumbnailImageUrl ?? ""), soldOut: it.itemStatus === "SOLD",
  };
}

const SORT: Record<NonNullable<SearchFilters["sort"]>, string> = { rec: "sort=ranking&order=desc", new: "sort=openTime&order=desc", price_asc: "sort=price&order=asc", price_desc: "sort=price&order=desc" };

async function searchApi(params: string): Promise<any[]> {
  const res = await fetchWithRetry(`${BASE}/api/v1/search?${params}`, { headers: { ...HEADERS, Accept: "application/json" }, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Yahoo Flea ${res.status}`);
  const j = await res.json();
  return Array.isArray(j?.items) ? j.items : [];
}

// 상품 상태 필터는 API 파라미터가 없어 응답의 condition.key(new / used10~used60)로 거른다
export async function yahooFleaSearch(keyword: string, f: SearchFilters = {}): Promise<MarketItem[]> {
  const p = new URLSearchParams({ query: keyword, results: "40" });
  if (!f.sold) p.set("open", "1");
  if (f.min) p.set("priceFrom", String(f.min));
  if (f.max) p.set("priceTo", String(f.max));
  const items = await searchApi(`${p.toString()}&${SORT[f.sort ?? "rec"]}`);
  return items
    .filter((it) => !f.cond || (f.cond === "new" ? it.condition?.key === "new" : String(it.condition?.key ?? "").startsWith("used")))
    .map(toItem);
}

async function sellerItems(sellerId: string, exclude: string): Promise<MarketItem[] | undefined> {
  try {
    const items = await searchApi(new URLSearchParams({ sellerId, open: "1", results: "9", sort: "openTime", order: "desc" }).toString());
    const list = items.map(toItem).filter((i) => i.sourceId !== exclude).slice(0, 8);
    return list.length ? list : undefined;
  } catch { return undefined; }
}

function extractNextData(html: string): any {
  const i = html.indexOf("__NEXT_DATA__");
  if (i < 0) throw new Error("Yahoo!フリマ 응답 형식 변경");
  const start = html.indexOf(">", i) + 1;
  const end = html.indexOf("</script>", start);
  return JSON.parse(html.slice(start, end));
}

const LOCATION: Record<string, string> = {
  HOKKAIDO: "北海道", AOMORI: "青森県", IWATE: "岩手県", MIYAGI: "宮城県", AKITA: "秋田県", YAMAGATA: "山形県", FUKUSHIMA: "福島県",
  IBARAKI: "茨城県", TOCHIGI: "栃木県", GUNMA: "群馬県", SAITAMA: "埼玉県", CHIBA: "千葉県", TOKYO: "東京都", KANAGAWA: "神奈川県",
  NIIGATA: "新潟県", TOYAMA: "富山県", ISHIKAWA: "石川県", FUKUI: "福井県", YAMANASHI: "山梨県", NAGANO: "長野県", GIFU: "岐阜県",
  SHIZUOKA: "静岡県", AICHI: "愛知県", MIE: "三重県", SHIGA: "滋賀県", KYOTO: "京都府", OSAKA: "大阪府", HYOGO: "兵庫県", NARA: "奈良県",
  WAKAYAMA: "和歌山県", TOTTORI: "鳥取県", SHIMANE: "島根県", OKAYAMA: "岡山県", HIROSHIMA: "広島県", YAMAGUCHI: "山口県",
  TOKUSHIMA: "徳島県", KAGAWA: "香川県", EHIME: "愛媛県", KOCHI: "高知県", FUKUOKA: "福岡県", SAGA: "佐賀県", NAGASAKI: "長崎県",
  KUMAMOTO: "熊本県", OITA: "大分県", MIYAZAKI: "宮崎県", KAGOSHIMA: "鹿児島県", OKINAWA: "沖縄県",
};

export async function yahooFleaItem(id: string): Promise<MarketItemDetail> {
  if (!/^[a-z]\d{6,}$/i.test(id)) throw new Error("잘못된 상품 번호");
  const res = await fetchWithRetry(`${BASE}/item/${id}`, { headers: { ...HEADERS, Accept: "text/html" }, next: { revalidate: 120 } });
  if (!res.ok) throw new Error(`Yahoo Flea ${res.status}`);
  const j = extractNextData(await res.text());
  const item = j?.props?.initialState?.itemsState?.items?.item;
  if (!item?.title) throw new Error("상품 정보를 찾을 수 없어요 (삭제됐을 수 있어요)");

  const images: string[] = (item.media ?? []).map((m: any) => m?.content?.url).filter((u: unknown): u is string => typeof u === "string").slice(0, 8);
  if (images.length === 0) for (const im of item.images ?? []) { const u = im?.url ?? im?.image; if (typeof u === "string" && images.length < 8) images.push(u); }
  const seller = item.seller ?? {};
  const rating = seller.rating ?? {};
  const cat: string[] = (item.categoryList ?? []).map((c: any) => String(c?.name ?? "")).filter(Boolean);
  const sold = item.status !== "OPEN" || item.isPurchased === true;
  const sellerId = seller.id ? String(seller.id) : "";

  return {
    source: "yahoo_flea", sourceId: String(item.id ?? id), url: `${BASE}/item/${item.id ?? id}`,
    title: String(item.title), price: Number(item.price) || 0, currency: "JPY",
    thumb: images[0] ?? "", soldOut: sold, auction: false,
    description: String(item.description ?? "").slice(0, 1500),
    images, sellerName: String(seller.nickname ?? seller.id ?? ""),
    condition: String(item.condition?.text ?? ""),
    // 사조가 보여주는 것들: 배송 방법·발송까지·발송지·브랜드 — 원문 그대로 (상세에서 뷰어 언어로 번역됨)
    extra: {
      ...(item.deliveryMethod?.name ? { "配送方法": String(item.deliveryMethod.name) } : {}),
      ...(item.deliverySchedule?.text ? { "発送まで": String(item.deliverySchedule.text) } : {}),
      ...(item.location ? { "発送元": LOCATION[String(item.location)] ?? String(item.location) } : {}),
      ...(item.brand?.name ? { "ブランド": String(item.brand.name) } : {}),
    },
    region: item.location ? LOCATION[String(item.location)] ?? String(item.location) : undefined,
    category: cat.length ? cat.join(" › ") : undefined,
    postedAt: item.openDate ? String(item.openDate) : undefined,
    counts: { favorites: Number(item.likeCount ?? 0), views: Number(item.pvCount ?? 0), chats: Number(item.questionCount ?? 0) },
    tradeTags: ["フリマ(定額)", "送料出品者負担", ...(item.isFreeShipFeeCampaign ? ["送料無料キャンペーン"] : []), ...(item.offerCount != null ? ["値下げ交渉可"] : [])],
    sellerRating: rating.total != null ? `${rating.goodRatio ?? ""}% (${rating.total})`.trim() : undefined,
    sellerUrl: sellerId ? `${BASE}/user/${sellerId}` : undefined,
    sellerItems: sellerId ? await sellerItems(sellerId, String(item.id ?? id)) : undefined,
  };
}
