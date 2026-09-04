import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { translateMessage } from "@/lib/translate";
import { pushToCounterpart } from "@/lib/push";
import { t } from "@/lib/i18n";

// API 라우트는 미들웨어 보호 밖 — 자체 인증 필수 (HANDOFF 주의사항)
export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { conversationId, body, imagePath } = await req.json().catch(() => ({}));
  if (typeof conversationId !== "string" || (body !== undefined && typeof body !== "string"))
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  const text = (body ?? "").trim();
  const image = typeof imagePath === "string" && imagePath.startsWith(`${conversationId}/${auth.user.id}/`) ? imagePath : null;
  if (text.length === 0 && !image) return NextResponse.json({ error: "empty message" }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "message must be 1-1000 chars" }, { status: 400 });

  // RLS: 참여자가 아니면 대화가 조회되지 않음 → 404
  const { data: convo } = await supabase.from("conversations")
    .select("id, buyer_id, seller_id, buyer:profiles!conversations_buyer_id_fkey(nickname, language), seller:profiles!conversations_seller_id_fkey(nickname, language)")
    .eq("id", conversationId).maybeSingle();
  if (!convo) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const { data: profile } = await supabase.from("profiles")
    .select("nickname, language").eq("id", auth.user.id).single();
  const from = (profile?.language ?? "ko") as "ko" | "ja";

  const translated = text ? await translateMessage(text, from) : null; // 실패해도 발송 성공 (스펙 §9)

  const { data: message, error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: auth.user.id,
    body: text,
    body_translated: translated,
    source_language: from,
    ...(image ? { image_path: image } : {}),
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 보낸 사람은 자기 메시지를 읽은 상태 — 안읽음 집계에서 제외되도록 읽음 시각 갱신
  await supabase.from("conversation_reads").upsert({ conversation_id: conversationId, user_id: auth.user.id, last_read_at: new Date().toISOString() });

  // 상대방 언어로 푸시 (VAPID 키 없으면 조용히 생략). 응답을 막지 않게 await하되 실패는 무시
  const mine = auth.user.id === convo.buyer_id;
  const other = (mine ? convo.seller : convo.buyer) as unknown as { nickname: string; language: "ko" | "ja" } | null;
  const otherLang = other?.language ?? "ko";
  const preview = text ? (otherLang === from ? text : translated ?? text) : t(otherLang, "chat.image");
  pushToCounterpart(supabase, conversationId, {
    title: t(otherLang, "notif.newMessage", { name: profile?.nickname ?? "TOMO" }),
    body: preview.slice(0, 120), url: `/chat/${conversationId}`, tag: `chat-${conversationId}`,
  }).catch(() => {});

  return NextResponse.json({ message }, { status: 201 });
}
