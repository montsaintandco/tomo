// 셸 공용 순수 함수 — 서버(layout)·클라이언트(HeaderCounts) 양쪽에서 쓴다. "use client" 를 붙이지 않는다.

// Supabase(@supabase/ssr) 세션 쿠키: sb-<ref>-auth-token, 길면 .0 .1 로 쪼개진다. httpOnly 가 아니라 브라우저에서도 보인다.
// <ref> 는 tomo 프로젝트 것만 본다 — 같은 도메인(localhost 등)에 다른 Supabase 프로젝트 쿠키가 있으면 오판한다(11/26 로컈에서 확인).
export function projectRef(url = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  try { return new URL(url ?? "").hostname.split(".")[0]; } catch { return ""; }
}

/** 쿠키 이름 목록에 로그인 세션 쿠키가 있나 — DB 왕복 없이 「로그인했을 것 같다」만 본다. 진짜 확인은 /api/me/summary */
export function hasAuthCookie(names: readonly string[], ref = projectRef()): boolean {
  if (!ref) return false;
  const base = `sb-${ref}-auth-token`;
  return names.some((n) => n === base || (n.startsWith(base) && /^\.\d+$/.test(n.slice(base.length))));
}

/** document.cookie 문자열에서 이름만 뽑는다 */
export function cookieNames(cookie: string): string[] {
  return cookie.split(";").map((c) => c.split("=")[0].trim()).filter(Boolean);
}

/**
 * 브라우저 모바일에서 하단 탭을 숨기는 화면 — 자기 하단 고정 바(구매·결제·채팅 입력)가 있다.
 * 설치된 앱(standalone)에서는 예전처럼 보이고, 각 화면이 standalone 여백으로 바를 탭 위에 올린다.
 */
export function hasOwnBottomBar(path: string): boolean {
  return /^\/(listings|global)\/./.test(path) || /^\/(cart|order)(\/|$)/.test(path) || /^\/chat\/./.test(path);
}

/** 떠 있는 문의 버튼을 숨기는 화면 — 고객센터(문의 입구 중복)·채팅·결제 흐름·인증·어드민 */
export function hideSupportLauncher(path: string): boolean {
  return /^\/(login|onboarding|admin|help|chat|cart|order)(\/|$)/.test(path);
}
