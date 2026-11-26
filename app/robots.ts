import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

// 색인 허용: 홈·상품·정보·법적 페이지. 차단: 개인 화면·API·결제 흐름·외부 상품 상세(항상 동적·품절 변동)·검색 결과.
// 검색 결과(?q=)는 질의마다 끝없이 생기는 얇은 페이지 — 크롤 예산만 쓴다. `?lang=ja` 변형은 막지 않는다.
// 규칙을 넓히면 상품 상세까지 막힌다 → tests/unit/seo-robots.test.ts 가 허용·차단 주소를 고정한다.
const DISALLOW = [
  "/admin", "/mypage", "/chat", "/api", "/order", "/transactions", "/cart", "/login", "/onboarding", "/sell", "/proxy", "/profile", "/global/",
  "/*?q=", "/*&q=",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}