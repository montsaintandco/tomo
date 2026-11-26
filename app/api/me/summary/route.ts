import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// 헤더 숫자(안읽은 채팅·장바구니·알림) — 레이아웃에서 빼서 화면이 뜬 뒤 한 번 부른다(components/shell/HeaderCounts).
// 비로그인은 클라이언트가 부르지 않는다. 오류면 503: 클라이언트는 지금 화면을 그대로 둔다.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: auth, error } = await supabase.auth.getUser();
    // 4xx(세션 없음·만료)는 진짜 비로그인. 인증 서버 장애(5xx·네트워크)는 503 — 로그인한 사람을 게스트로 뒤집지 않는다
    if (error && !(error.status && error.status >= 400 && error.status < 500)) throw error;
    if (!auth.user) return NextResponse.json({ loggedIn: false, unread: 0, cart: 0, notif: -1 }, { headers: NO_STORE });
    // 세 조회는 서로 무관 — 병렬
    const [u, c, n] = await Promise.all([
      supabase.rpc("unread_count"),
      supabase.from("cart_items").select("*", { count: "exact", head: true }),
      supabase.rpc("unread_notifications"),
    ]);
    return NextResponse.json({
      loggedIn: true,
      unread: Number(u.data ?? 0),
      cart: c.count ?? 0,
      notif: n.error ? -1 : Number(n.data ?? 0), // 0027 미적용·오류면 -1 → 벨 숨김
    }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
