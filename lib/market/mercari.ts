// 메루카리 비공식 API 클라이언트 (서버 전용) — tokyobuy lib/mercari-server.ts 이식
// DPoP(ES256) 토큰을 WebCrypto로 생성해 api.mercari.jp 호출
// 주의: 비공식 API — 스키마/차단 정책이 언제든 바뀔 수 있음. 실패는 호출부에서 빈 결과로 처리

/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchWithRetry } from "./http";
import type { MarketItem, MarketItemDetail } from "./types";

const API_BASE = "https://api.mercari.jp";

let keyPromise: Promise<CryptoKeyPair> | null = null;
function getKeyPair(): Promise<CryptoKeyPair> {
  if (!keyPromise) {
    keyPromise = crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]
    ) as Promise<CryptoKeyPair>;
  }
  return keyPromise;
}

function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return Buffer.from(bin, "binary").toString("base64url");
}

async function makeDpop(method: string, htu: string): Promise<string> {
  const { privateKey, publicKey } = await getKeyPair();
  const jwk = (await crypto.subtle.exportKey("jwk", publicKey)) as any;
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y } };
  const payload = {
    iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID(),
    htu, htm: method, uuid: crypto.randomUUID(),
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(input));
  return `${input}.${b64url(sig)}`;
}

async function mercariFetch(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const url = `${API_BASE}${path}`;
  const dpop = await makeDpop(method, url.split("?")[0]);
  const res = await fetchWithRetry(url, {
    method,
    headers: {
      DPoP: dpop, "X-Platform": "web", "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
    body: body ? JSON.stringify(body) : undefined,
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Mercari API ${res.status}`);
  return res.json();
}

export async function mercariSearch(keyword: string, page = 1): Promise<MarketItem[]> {
  // pageToken 기반이지만 단순 오프셋 페이지 흉내: v2 검색은 pageToken "v1:{page}" 포맷 미보장 → 첫 페이지만 사용
  // ponytail: 페이지네이션은 첫 페이지 36건으로 충분, 무한스크롤 필요 시 pageToken 배선
  void page;
  const data = await mercariFetch("POST", "/v2/entities:search", {
    userId: "", pageSize: 36, pageToken: "",
    searchSessionId: crypto.randomUUID().replace(/-/g, ""),
    indexRouting: "INDEX_ROUTING_UNSPECIFIED", thumbnailTypes: [],
    searchCondition: {
      keyword, excludeKeyword: "", sort: "SORT_SCORE", order: "ORDER_DESC",
      status: ["STATUS_ON_SALE"], categoryId: [], priceMin: 0, priceMax: 0,
    },
    defaultDatasets: ["DATASET_TYPE_MERCARI"], serviceFrom: "suruga",
  });
  return (data.items ?? []).map((it: any): MarketItem => ({
    source: "mercari", sourceId: it.id,
    url: `https://jp.mercari.com/item/${it.id}`,
    title: it.name, price: Number(it.price), currency: "JPY",
    thumb: it.thumbnails?.[0] ?? "", soldOut: it.status !== "ITEM_STATUS_ON_SALE",
  }));
}

export async function mercariItem(id: string): Promise<MarketItemDetail> {
  const res = await mercariFetch("GET", `/items/get?id=${encodeURIComponent(id)}`);
  const d = res.data;
  return {
    source: "mercari", sourceId: d.id,
    url: `https://jp.mercari.com/item/${d.id}`,
    title: d.name, price: Number(d.price), currency: "JPY",
    thumb: d.photos?.[0] ?? "", soldOut: d.status !== "on_sale",
    description: d.description ?? "", images: d.photos ?? [],
    sellerName: d.seller?.name ?? "",
    condition: d.item_condition?.name ?? "",
    extra: {
      배송부담: d.shipping_payer?.name ?? "",
      발송지: d.shipping_from_area?.name ?? "",
      발송까지: d.shipping_duration?.name ?? "",
    },
  };
}
