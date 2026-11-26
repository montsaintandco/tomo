import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 공개 브라우징: 홈·상세·검색·프로필은 누구나. 행동(판매·채팅·거래·대행·어드민)만 로그인.
// /mypage·/cart·/order 는 페이지가 스스로 로그인으로 보낸다(getViewer → redirect).
export const PROTECTED = ["/sell", "/chat", "/transactions", "/admin", "/proxy", "/onboarding"] as const;
export const isProtectedPath = (path: string) => PROTECTED.some((p) => path.startsWith(p));

export async function proxy(req: NextRequest) {
  // ?lang=ko|ja — hreflang 변형 URL. 쿠키 없이도 그 언어로 렌더되도록 요청 헤더에 싣는다 (lib/locale.ts가 최우선으로 읽음)
  const langParam = req.nextUrl.searchParams.get("lang");
  const reqHeaders = new Headers(req.headers);
  if (langParam === "ko" || langParam === "ja") reqHeaders.set("x-tomo-lang", langParam);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.append("Vary", "Accept-Language"); // 같은 URL이 언어별로 다르게 렌더됨을 캐시·크롤러에 알린다
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  );
  const path = req.nextUrl.pathname;
  // 공개 경로: 인증 서버 왕복(getUser) 없이 쿠키만 읽는다. 액세스 토큰이 만료됐을 때만 getSession 이 갱신해 쿠키를 다시 쓴다
  // (서버 컴포넌트는 쿠키를 못 쓰므로 갱신은 여기 전 경로에 남긴다). 세션 쿠키가 없으면 네트워크 호출 0회.
  if (!isProtectedPath(path)) {
    await supabase.auth.getSession();
    return res;
  }
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  // 로그인했지만 프로필(온보딩) 미완 → 보호 경로 접근 시 온보딩으로
  if (!path.startsWith("/onboarding")) {
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (!profile) return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  return res;
}

export const config = { matcher: ["/((?!_next|favicon|api|.*\\..*).*)"] };
