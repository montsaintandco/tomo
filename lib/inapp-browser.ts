// 앱 안 브라우저(인앱) 감지 — 키라팝(bf292ad8, 2026-11-25)에서 가져왔다(03#3).
// 네이버·카카오톡 등 앱 안에서는 로그인 쿠키가 안 남거나 OAuth 가 막혀 로그인이 풀릴 수 있다. 로그인 화면에 「기본 브라우저로 열기」 안내만 띄운다.
// 잘 알려진 표식만 본다(오탐을 줄이려고). 순수 함수 — tests/unit/shell-inapp.test.ts

export type InAppApp = "naver" | "kakaotalk" | "line" | "instagram" | "facebook" | "daum" | "everytime";
export type InAppInfo = { app: InAppApp; platform: "android" | "ios" | "other" };

const MARKS: [InAppApp, RegExp][] = [
  ["kakaotalk", /KAKAOTALK/i],
  ["naver", /NAVER\(inapp/i],
  ["line", /\bLine\//],
  ["instagram", /Instagram/],
  ["facebook", /FBAN|FBAV|FB_IAB/],
  ["daum", /DaumApps/i],
  ["everytime", /everytimeApp/i],
];

export function detectInApp(ua: string | null | undefined): InAppInfo | null {
  const s = String(ua ?? "");
  const hit = MARKS.find(([, re]) => re.test(s));
  if (!hit) return null;
  const platform = /Android/i.test(s) ? "android" : /iPhone|iPad|iPod/i.test(s) ? "ios" : "other";
  return { app: hit[0], platform };
}

/** 앱 이름 [한국어, 日本語] */
export const IN_APP_NAME: Record<InAppApp, readonly [string, string]> = {
  naver: ["네이버 앱", "NAVERアプリ"], kakaotalk: ["카카오톡", "カカオトーク"], line: ["라인", "LINE"],
  instagram: ["인스타그램", "Instagram"], facebook: ["페이스북", "Facebook"], daum: ["다음 앱", "Daumアプリ"], everytime: ["에브리타임", "Everytime"],
};

/**
 * 기본 브라우저로 여는 주소. 없으면 null(주소 복사 안내만).
 * - 카카오톡: 공식 스킴 kakaotalk://web/openExternal (안드로이드·아이폰)
 * - 라인: 주소에 openExternalBrowser=1 (공식)
 * - 안드로이드 그 밖: 크롬 intent (크롬이 없으면 fallback 으로 지금 화면에 머문다)
 * - 아이폰 네이버·인스타 등: 강제로 여는 공식 방법이 없다 → null
 */
export function externalOpenUrl(info: InAppInfo, href: string): string | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  if (u.protocol !== "https:") return null;
  if (info.app === "kakaotalk") return `kakaotalk://web/openExternal?url=${encodeURIComponent(u.toString())}`;
  if (info.app === "line") { u.searchParams.set("openExternalBrowser", "1"); return u.toString(); }
  if (info.platform === "android") {
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.toString())};end`;
  }
  return null;
}