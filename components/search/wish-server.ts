import type { SupabaseClient } from "@supabase/supabase-js";
import { rows } from "@/lib/safe";
import { wishKey } from "@/components/search/wish";

// 서버 화면용: 카드 여러 장의 찜 여부를 한 번에 읽는다. 비로그인(userId null)·빈 목록은 조회하지 않는다.
// 0038 이 아직 없으면 rows() 가 빈 배열 → 모두 빈 하트(화면은 그대로)
export async function wishedKeys(supabase: SupabaseClient, userId: string | null, items: { source: string; sourceId: string }[]): Promise<Set<string>> {
  if (!userId || items.length === 0) return new Set();
  const ids = Array.from(new Set(items.map((i) => i.sourceId))).slice(0, 200);
  const res = await supabase.from("external_wishlists").select("source, source_id").eq("user_id", userId).in("source_id", ids);
  return new Set(rows(res as { data: { source: string; source_id: string }[] | null; error: { code?: string } | null }).map((r) => wishKey(r.source, r.source_id)));
}

// 카드 묶음용: viewer 를 받으면 찜 여부를 한 번에 읽어 카드별 wish prop 을 만든다. viewer 를 안 넘기면 하트 없음(undefined)
export async function wishFor(viewer: { id: string | null; guest?: boolean } | undefined, items: { source: string; sourceId: string }[]):
  Promise<((it: { source: string; sourceId: string }) => { wished: boolean; guest: boolean }) | undefined> {
  if (!viewer) return undefined;
  const { createServerSupabase } = await import("@/lib/supabase/server");
  const set = await wishedKeys(await createServerSupabase(), viewer.id, items).catch(() => new Set<string>());
  return (it) => ({ wished: set.has(wishKey(it.source, it.sourceId)), guest: !!viewer.guest });
}