import type { Metadata } from "next";
import { t, type Lang } from "./i18n";
import { SITE_URL } from "./site";
import { PLATFORM_FEE_RATE } from "./fees";

// 공유 미리보기 기본 이미지 — app/opengraph-image.tsx 가 만든다. 페이지 openGraph 가 부모 것을 통째로 덮으므로 매번 넣는다
export const OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "TOMO" } as const;

export type SeoPage = "home" | "global" | "categories" | "cat" | "help" | "guide" | "about" | "notice" | "travel" | "terms" | "privacy" | "refund";

// 페이지 메타 — 제목·설명·og·twitter 를 화면 언어(lang)로 낸다. 문구는 lib/i18n-port/seo.ts 의 seo.meta.<page>.*.
// lang 은 화면을 그린 것과 같은 lib/locale.ts getRequestLang() 값을 넘긴다 → canonical·og:locale 이 화면 언어와 같다.
export function pageMeta(path: string, page: SeoPage, lang: Lang = "ko", vars?: Record<string, string | number>): Metadata {
  const title = t(lang, `seo.meta.${page}.title`, vars);
  const description = t(lang, `seo.meta.${page}.desc`, vars);
  const full = page === "home" ? title : `${title} | TOMO`;
  const alternates = langAlternates(path, lang);
  return {
    title: page === "home" ? { absolute: title } : title,
    description,
    alternates,
    openGraph: {
      type: "website", siteName: "TOMO", url: alternates.canonical as string, title: full, description,
      locale: lang === "ja" ? "ja_JP" : "ko_KR", alternateLocale: lang === "ja" ? "ko_KR" : "ja_JP", images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: full, description, images: [OG_IMAGE.url] },
  };
}

// 상세·동적 페이지용 hreflang 묶음(05-roadmap 2차 준비). generateMetadata 에서 alternates 로 그대로 쓴다.
// ko = 기본 URL, ja = ?lang=ja, x-default = ko. canonical 은 화면 언어 쪽.
export function langAlternates(path: string, lang: Lang = "ko"): NonNullable<Metadata["alternates"]> {
  const ko = path;
  const ja = `${path}${path.includes("?") ? "&" : "?"}lang=ja`;
  return { canonical: lang === "ja" ? ja : ko, languages: { ko, ja, "x-default": ko } };
}

// 화면 언어 주소 — 구조화 데이터 item URL 용(절대주소)
export const langUrl = (path: string, lang: Lang) => `${SITE_URL}${path}${lang === "ja" ? `${path.includes("?") ? "&" : "?"}lang=ja` : ""}`;

// WebSite 구조화 데이터(01#13) — 검색결과의 사이트 이름. 홈에만 둔다(구글 기준). lib/json-ld.ts jsonLd() 로 넣는다.
export function websiteJsonLd() {
  return { "@context": "https://schema.org", "@type": "WebSite", name: "TOMO", url: `${SITE_URL}/`, inLanguage: ["ko", "ja"] };
}

// 직거래 판매 수수료 문장 — /guide·/help FAQ·/llms.txt 가 같은 문장을 쓴다. 숫자는 lib/fees.ts 상수에서
export const directFeeText = (lang: Lang) => t(lang, "seo.fee.direct", { pct: Math.round(PLATFORM_FEE_RATE * 100) });
