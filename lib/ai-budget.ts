import type { SupabaseClient } from "@supabase/supabase-js";
import { tableMissing } from "./safe";

// AI 상담 하루 상한(T3, 01#14·02#6). support_ai_log(0030) 의 오늘(한국·일본 자정 기준) 건수로 본다.
// 분당 한도(lib/ratelimit)는 서버 재시작에 초기화되지만 이 상한은 DB 라서 남는다.
export const AI_DAILY_CAP = Number(process.env.SUPPORT_AI_DAILY_CAP) || 300;
export const AI_DAILY_PER_IP = Number(process.env.SUPPORT_AI_DAILY_PER_IP) || 30;

/** 오늘 0시(UTC+9) ISO */
export function dayStartIso(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600_000).toISOString();
}

export type BudgetVerdict = "ok" | "cap" | "ip";
export function budgetVerdict(total: number, perIp: number, cap = AI_DAILY_CAP, ipCap = AI_DAILY_PER_IP): BudgetVerdict {
  if (total >= cap) return "cap";
  if (perIp >= ipCap) return "ip";
  return "ok";
}

/** 서비스 롤 클라이언트로 오늘 건수를 세어 판정. 표가 없으면 통과, 그 밖의 조회 실패는 막는다(비용 쪽이 안전) */
export async function checkAiBudget(admin: SupabaseClient, ipHash: string): Promise<BudgetVerdict> {
  const since = dayStartIso();
  const [all, mine] = await Promise.all([
    admin.from("support_ai_log").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("support_ai_log").select("id", { count: "exact", head: true }).gte("created_at", since).eq("ip_hash", ipHash),
  ]);
  if (all.error || mine.error) return tableMissing(all.error ?? mine.error) ? "ok" : "cap";
  return budgetVerdict(all.count ?? 0, mine.count ?? 0);
}
