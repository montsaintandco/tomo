import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { adminCancel } from "@/lib/admin-actions";

export const runtime = "nodejs";

// 운영자 취소·분쟁 처리·강제 구매확정. 본체는 lib/admin-actions.ts(운영 API 와 공용)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const r = await adminCancel(supabase, await req.json().catch(() => ({})));
  return NextResponse.json(r.body, { status: r.status });
}
