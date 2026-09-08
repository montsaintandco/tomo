import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 공개 브라우징: 홈·상세·검색·프로필은 누구나. 행동(판매·채팅·거래·대행·어드민)만 로그인.
const PROTECTED = ["/sell", "/chat", "/transactions", "/admin", "/proxy", "/onboarding"];

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
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path.startsWith(p));

  if (!data.user) {
    if (!isProtected) return res; // 게스트 공개 열람
    const login = new URL("/login", req.url);
    login.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(login);
  }

  // 로그인했지만 프로필(온보딩) 미완 → 보호 경로 접근 시 온보딩으로
  if (isProtected && !path.startsWith("/onboarding")) { // 공개 경로에선 프로필 왕복 생략
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (!profile && isProtected) return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  return res;
}

export const config = { matcher: ["/((?!_next|favicon|api|.*\\..*).*)"] };
