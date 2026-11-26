import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { findMajor } from "./lib/categories";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL = /^\/(categories|listings|order|profile)\/([^/]+)$/;
const DETAIL_TABLE = { listings: "listings", order: "proxy_orders", profile: "profiles" } as const;

// 없는 상세 주소 판정 — 루트 loading.tsx 때문에 본문 스트리밍이 먼저 시작돼 페이지의 notFound()는 200(소프트 404)이 된다.
// 그래서 스트리밍 전에 여기서 판정해 진짜 404 를 준다. 조회는 페이지와 같은 세션 클라이언트(같은 RLS)로 id 한 칸만.
// RSC(화면 안 이동) 요청은 조회를 건너뛴다 — 페이지 notFound()가 화면을 맡는다. 조회 오류면 막지 않는다.
export async function isMissingDetail(
  path: string, opts: { rsc: boolean; hasSession: boolean; exists: (table: string, id: string) => Promise<boolean | null> },
): Promise<boolean> {
  const m = DETAIL.exec(path);
  if (!m) return false;
  const kind = m[1] as "categories" | keyof typeof DETAIL_TABLE;
  const id = decodeURIComponent(m[2]);
  if (kind === "categories") return !findMajor(id);
  if (kind === "profile" && id === "me") return false;
  if (!UUID.test(id)) return true;
  if (kind === "order" && !opts.hasSession) return false; // 비로그인은 아래에서 로그인으로 보낸다(307)
  if (opts.rsc) return false;
  return (await opts.exists(DETAIL_TABLE[kind], id)) === false;
}

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
    const { data: { session } } = await supabase.auth.getSession();
    const missing = await isMissingDetail(path, {
      rsc: req.headers.get("rsc") === "1", hasSession: !!session,
      exists: async (table, id) => {
        const { data, error } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
        return error ? null : !!data;
      },
    });
    // 주문 상세는 비로그인이면 스트리밍 전에 로그인으로 보낸다(페이지 redirect 는 스트리밍 뒤라 200 이 된다)
    if (!missing && !session && /^\/order\/[^/]+$/.test(path)) {
      const login = new URL("/login", req.url);
      login.searchParams.set("next", path);
      return NextResponse.redirect(login);
    }
    if (missing) {
      // 없는 경로로 바꿔 쓰면 app/not-found.tsx 가 404 상태로 나간다. 세션 갱신 쿠키는 옮겨 싣는다
      const nf = NextResponse.rewrite(new URL("/__tomo_not_found", req.url), { request: { headers: reqHeaders } });
      res.cookies.getAll().forEach((c) => nf.cookies.set(c));
      return nf;
    }
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
