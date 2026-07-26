import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 공개 브라우징: 홈·상세·검색·프로필은 누구나. 행동(판매·채팅·거래·대행·어드민)만 로그인.
const PROTECTED = ["/sell", "/chat", "/transactions", "/admin", "/proxy", "/onboarding"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
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
  if (!path.startsWith("/onboarding")) {
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (!profile && isProtected) return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  return res;
}

export const config = { matcher: ["/((?!_next|favicon|api|.*\\..*).*)"] };
