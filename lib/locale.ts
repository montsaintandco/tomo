import { cookies, headers } from "next/headers";
import type { Lang } from "./i18n";

export const LANG_COOKIE = "tomo_lang";

// 요청 언어: 토글 쿠키 → Accept-Language(ja 우선 여부) → ko. 서버 전용
export async function getRequestLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c === "ja" || c === "ko") return c;
  const accept = (await headers()).get("accept-language") ?? "";
  // 첫 번째로 등장하는 ko/ja 중 앞선 쪽이 선호 언어
  const ja = accept.search(/\bja\b/i);
  const ko = accept.search(/\bko\b/i);
  if (ja >= 0 && (ko < 0 || ja < ko)) return "ja";
  return "ko";
}
