import { cookies, headers } from "next/headers";
import type { Lang } from "./i18n";

export const LANG_COOKIE = "tomo_lang";

// 요청 언어: 토글 쿠키 → Accept-Language(ja 우선 여부) → ko. 서버 전용
export async function getRequestLang(): Promise<Lang> {
  // URL 변형(?lang=)이 최우선 — proxy.ts가 헤더로 넘긴다. 크롤러·공유 링크가 쿠키 없이 특정 언어를 열 수 있게
  const h = (await headers()).get("x-tomo-lang");
  if (h === "ja" || h === "ko") return h;
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c === "ja" || c === "ko") return c;
  const accept = (await headers()).get("accept-language") ?? "";
  // 첫 번째로 등장하는 ko/ja 중 앞선 쪽이 선호 언어
  const ja = accept.search(/\bja\b/i);
  const ko = accept.search(/\bko\b/i);
  if (ja >= 0 && (ko < 0 || ja < ko)) return "ja";
  return "ko";
}
