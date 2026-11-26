import type { MarketSource } from "@/lib/market/types";

// 고객이 보낸 상품 스냅샷의 이미지는 그 마켓의 이미지 호스트만 받는다(T3, 03 SSRF 가드).
// 우리 도메인 상세·관리 화면에 임의 서버 이미지(추적 픽셀·피싱 배너)가 실리는 것을 막는다.
// 호스트는 점 경계로 끝이 맞아야 한다(evilmercdn.net 거부). 마켓이 CDN 을 바꾸면 여기만 고친다.
export const MARKET_IMAGE_HOSTS: Record<MarketSource, string[]> = {
  mercari: ["mercdn.net", "mercari.jp", "mercari.com"],
  yahoo_auction: ["yimg.jp", "yahoo.co.jp"],
  yahoo_flea: ["yimg.jp", "yahoo.co.jp"],
  daangn: ["daangn.com", "karrotmarket.com", "karroter.net", "dnvefa72aowie.cloudfront.net"],
  joongna: ["joongna.com"],
};

/** https 이고 포트·계정·IP 리터럴이 없으며 호스트가 그 마켓 목록에 있는 URL 인지 */
export function isMarketImageUrl(source: MarketSource, raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(":")) return false; // IPv4·IPv6 리터럴
  return (MARKET_IMAGE_HOSTS[source] ?? []).some((h) => host === h || host.endsWith(`.${h}`));
}
