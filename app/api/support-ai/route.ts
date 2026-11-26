import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { allow, clientIp } from "@/lib/ratelimit";
import { tableMissing } from "@/lib/safe";
import { checkAiBudget } from "@/lib/ai-budget";
import { parseAiTurns } from "@/lib/support-ai";
import { aiEnabled, supportAiModel, buildSystemPrompt, customerContext, streamAnswer, GatewayError } from "@/lib/support-ai.server";

// 지원 봇 AI 답변 — POST { lang, messages: [{ role, content }] } → 답변 글자 스트림(text/plain). 에어쉽 /api/support-ai 이식.
// 비로그인도 쓴다. 로그인 세션이 있으면 본인 최근 거래·대행 상태를 근거로 넣는다(RLS 클라이언트라 본인 것만).
// 공개 API라 IP 분당 10회 + 본문 크기 제한. 스트림 전에 실패하면 JSON { error } (400/413/429/502/503) → 화면은 봇 트리로 조용히 폴백.
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(req: Request) {
  if (!aiEnabled()) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const ip = clientIp(req);
  if (!allow(`support-ai:${ip}`, 10)) return NextResponse.json({ error: "busy" }, { status: 429 });

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: { lang?: unknown; messages?: unknown } | null = null;
  try { body = JSON.parse(raw); } catch { /* 아래에서 400 */ }
  const turns = parseAiTurns(body?.messages);
  if (!turns) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const lang = body?.lang === "ja" ? "ja" : "ko";

  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;
  const customer = userId ? await customerContext(supabase, userId, lang).catch(() => null) : null;
  const model = supportAiModel();
  const question = turns[turns.length - 1].content;
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  // 하루 상한(전체·IP별). 넘으면 429 → 화면은 봇 트리로 폴백. 서비스 키가 없는 개발 환경은 건너뛴다
  let admin: ReturnType<typeof createAdminSupabase> | null = null;
  try { admin = createAdminSupabase(); } catch { /* SUPABASE_SERVICE_ROLE_KEY 없음 */ }
  if (admin && (await checkAiBudget(admin, ipHash).catch(() => "cap" as const)) !== "ok")
    return NextResponse.json({ error: "busy" }, { status: 429 });
  const log = (answer: string, ok: boolean) => void logUse({ user_id: userId, ip_hash: ipHash, lang, model, question, answer: answer.slice(0, 4000), ok });

  try {
    const stream = await streamAnswer({
      token: process.env.AI_GATEWAY_API_KEY!.trim(), model,
      system: buildSystemPrompt(lang, userId ? (customer ?? "(내역을 읽지 못함)") : null),
      turns, signal: req.signal, onDone: log,
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (e) {
    console.error("[support-ai]", e instanceof Error ? e.message : e);
    log("", false);
    const busy = e instanceof GatewayError && e.status === 429;
    return NextResponse.json({ error: busy ? "busy" : "failed" }, { status: busy ? 429 : 502 });
  }
}

// 사용 로그(0030) — 서비스 롤로 insert. 표가 없거나 키가 없으면 조용히 건너뛴다
async function logUse(row: { user_id: string | null; ip_hash: string; lang: string; model: string; question: string; answer: string; ok: boolean }) {
  try {
    const { error } = await createAdminSupabase().from("support_ai_log").insert(row);
    if (error && !tableMissing(error)) console.error("[support-ai log]", error.message);
  } catch { /* SUPABASE_SERVICE_ROLE_KEY 없음 */ }
}
