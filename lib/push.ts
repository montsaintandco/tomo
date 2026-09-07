import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type PushPayload = { title: string; body: string; url: string; tag?: string };

// 대화 상대에게 웹푸시. VAPID 키가 없으면 조용히 생략 (키 없이도 우아하게).
// 대상 조회는 push_targets() SECURITY DEFINER — 호출자가 참여자일 때 상대 구독만 돌려준다
export async function pushToCounterpart(supabase: SupabaseClient, conversationId: string, payload: PushPayload): Promise<void> {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  // 0023 이후: 구독 키를 클라이언트가 못 읽게 push_targets_for(service_role 전용)로. 마이그레이션 전이면 기존 함수로 폴백
  const { data: auth } = await supabase.auth.getUser();
  let targets: unknown[] | null = null;
  if (auth.user) {
    const { data, error } = await createAdminSupabase().rpc("push_targets_for", { p_conversation: conversationId, p_sender: auth.user.id });
    if (!error) targets = data;
  }
  if (!targets) ({ data: targets } = await supabase.rpc("push_targets", { p_conversation: conversationId }));
  if (!targets || targets.length === 0) return;

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@tomo.app", pub, priv);
  const body = JSON.stringify(payload);
  await Promise.all((targets as { endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
    } catch (e: unknown) {
      // 410/404 = 구독 만료 → 정리. 본인 구독이 아니라 RLS로 못 지우니 무시 (다음 구독 시 endpoint unique로 대체됨)
      const status = (e as { statusCode?: number }).statusCode;
      if (status !== 404 && status !== 410) console.error("push failed", status);
    }
  }));
}
