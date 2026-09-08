import type { Metadata } from "next";
import type { Lang } from "./i18n";

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

// 정적 페이지용 — searchParams의 lang만 본다 (쿠키는 크롤러가 갖지 않으므로 메타에는 쓰지 않는다)
export function langFromSearch(sp: { lang?: string } | undefined): Lang {
  return sp?.lang === "ja" ? "ja" : "ko";
}
