import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { translateMessage } from "@/lib/translate";

// API 라우트는 미들웨어 보호 밖 — 자체 인증 필수 (HANDOFF 주의사항)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { conversationId, body } = await req.json().catch(() => ({}));
  if (typeof conversationId !== "string" || typeof body !== "string")
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  const text = body.trim();
  if (text.length === 0 || text.length > 1000)
    return NextResponse.json({ error: "message must be 1-1000 chars" }, { status: 400 });

  // RLS: 참여자가 아니면 대화가 조회되지 않음 → 404
  const { data: convo } = await supabase.from("conversations")
    .select("id").eq("id", conversationId).maybeSingle();
  if (!convo) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const { data: profile } = await supabase.from("profiles")
    .select("language").eq("id", auth.user.id).single();
  const from = (profile?.language ?? "ko") as "ko" | "ja";

  const translated = await translateMessage(text, from); // 실패해도 발송 성공 (스펙 §9)

  const { data: message, error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: auth.user.id,
    body: text,
    body_translated: translated,
    source_language: from,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ message }, { status: 201 });
}
