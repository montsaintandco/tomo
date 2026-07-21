import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const isPublic = path.startsWith("/login");
  if (!data.user && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  if (data.user && !isPublic && !path.startsWith("/onboarding")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile) return NextResponse.redirect(new URL("/onboarding", req.url));
  }
  return res;
}

export const config = { matcher: ["/((?!_next|favicon|api|.*\\..*).*)"] };
