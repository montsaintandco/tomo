import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 색인 허용: 홈·상품·검색·정보·법적 페이지. 차단: 개인 화면·API·결제 흐름·외부 상품 상세(항상 동적·품절 변동)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/mypage", "/chat", "/api", "/order", "/transactions", "/cart", "/login", "/onboarding", "/sell", "/proxy", "/profile", "/global/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
