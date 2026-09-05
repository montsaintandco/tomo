import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// 문의 접수 — 지원 봇 "상담원 연결" 폼. 미들웨어 밖, 자체 인증. RLS가 user_id = auth.uid()를 강제
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const category = ["before", "after", "sell", "travel"].includes(b.category) ? b.category : null;
  const body = String(b.body ?? "").trim().slice(0, 2000);
  if (!category || !body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const str = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };
  const qty = Number(b.quantity); // 트러스트 경계: 숫자·범위 검증
  const { data, error } = await supabase.from("support_tickets").insert({
    user_id: auth.user.id, category, body,
    item_url: str(b.itemUrl, 500), item_option: str(b.itemOption, 200), order_ref: str(b.orderRef, 200),
    quantity: Number.isInteger(qty) && qty > 0 && qty < 1000 ? qty : null,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
