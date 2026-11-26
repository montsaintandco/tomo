import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// 색인 허용: 홈·상품·정보·법적 페이지. 차단: 개인 화면·API·결제 흐름·검색 결과.
// 외부 상품 상세(/global/<마켓>/<id>)는 막지 않는다 — 페이지의 noindex,follow 를 구글이 읽어야 URL 만 색인되는 일이 없다(08-seo-tech).
// 검색 결과(?q=)는 질의마다 끝없이 생기는 얇은 페이지 — 크롤 예산만 쓴다. `?lang=ja` 변형은 막지 않는다.
// 규칙을 넓히면 상품 상세까지 막힌다 → tests/unit/seo-rules.test.ts 가 허용·차단 주소를 고정한다.
const DISALLOW = [
  "/admin", "/mypage", "/chat", "/api", "/order", "/transactions", "/cart", "/login", "/onboarding", "/sell", "/proxy", "/profile",
  "/*?q=", "/*&q=",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}