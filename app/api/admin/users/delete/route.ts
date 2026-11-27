import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { adminDeleteUser } from "@/lib/admin-actions";

// 운영자가 사용자 계정 완전 삭제. 본체는 lib/admin-actions.ts(운영 API 와 공용)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const { userId } = await req.json().catch(() => ({}));
  const r = await adminDeleteUser(supabase, viewer.id, userId);
  return NextResponse.json(r.body, { status: r.status });
}
