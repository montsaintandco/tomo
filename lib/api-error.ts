import { NextResponse } from "next/server";
import { t, type Lang, type I18nKey } from "./i18n";

// API 오류를 요청자 언어로 돌려준다(01#12: 한국어 하드코딩 오류가 일본어 사용자에게 그대로 보이던 문제).
// 키는 각 트랙의 lib/i18n-port/<트랙>.ts 에 넣는다. 응답 형태는 기존과 같은 { error: string }.
export function apiError(lang: Lang, key: I18nKey, status = 400, vars?: Record<string, string | number>) {
  return NextResponse.json({ error: t(lang, key, vars), code: key }, { status });
}

// 요청에서 언어를 고른다: 쿠키 tomo_lang → Accept-Language → ko
export function reqLang(req: Request): Lang {
  const c = req.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)tomo_lang=(ko|ja)/.exec(c);
  if (m) return m[1] as Lang;
  return /^ja\b/i.test(req.headers.get("accept-language") ?? "") ? "ja" : "ko";
}