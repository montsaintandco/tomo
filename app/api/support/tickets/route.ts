import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// 내 문의 목록 — 지원 패널 "대화" 탭용. RLS가 자기 것만 돌려준다
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ tickets: null }, { status: 401 });
  const { data } = await supabase.from("support_tickets").select("id, category, body, status, reply, created_at, answered_at")
    .order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ tickets: data ?? [] });
}
