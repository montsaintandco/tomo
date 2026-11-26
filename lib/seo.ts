import type { Metadata } from "next";
import type { Lang } from "./i18n";
import { SITE_URL } from "./site";

// 페이지 메타 — canonical은 자기 경로, hreflang은 ko(기본 URL)·ja(?lang=ja)·x-default.
// 언어는 쿠키가 아니라 URL(?lang=)로도 정해지므로(proxy.ts) 크롤러가 두 변형을 각각 볼 수 있다.
export function pageMeta(
  path: string,
  m: { title: string; description?: string },
  lang: Lang = "ko",
): Metadata {
  const ko = path;
  const ja = `${path}${path.includes("?") ? "&" : "?"}lang=ja`;
  return {
    title: m.title,
    ...(m.description ? { description: m.description } : {}),
    alternates: { canonical: lang === "ja" ? ja : ko, languages: { ko, ja, "x-default": ko } },
    openGraph: { locale: lang === "ja" ? "ja_JP" : "ko_KR" },
  };
}

// 상세·동적 페이지용 hreflang 묶음(05-roadmap 2차 준비). generateMetadata 에서 alternates 로 그대로 쓴다.
// ko = 기본 URL, ja = ?lang=ja, x-default = ko. canonical 은 화면 언어 쪽.
export function langAlternates(path: string, lang: Lang = "ko"): NonNullable<Metadata["alternates"]> {
  const ko = path;
  const ja = `${path}${path.includes("?") ? "&" : "?"}lang=ja`;
  return { canonical: lang === "ja" ? ja : ko, languages: { ko, ja, "x-default": ko } };
}

// WebSite 구조화 데이터(01#13) — 검색결과의 사이트 이름. 홈에만 둔다(구글 기준). lib/json-ld.ts jsonLd() 로 넣는다.
// 홈(app/page.tsx)·레이아웃은 T9 소유가 아니라 연결은 메인이 한다.
export function websiteJsonLd() {
  return { "@context": "https://schema.org", "@type": "WebSite", name: "TOMO", url: `${SITE_URL}/`, inLanguage: ["ko", "ja"] };
}

// 정적 페이지용 — searchParams의 lang만 본다 (쿠키는 크롤러가 갖지 않으므로 메타에는 쓰지 않는다)
export function langFromSearch(sp: { lang?: string } | undefined): Lang {
  return sp?.lang === "ja" ? "ja" : "ko";
}
