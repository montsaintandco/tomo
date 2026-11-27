// 경매 API 공통(app/api/auctions/**). 기능 플래그가 꺼져 있으면 모든 경매 API 는 404.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { apiError, reqLang } from "@/lib/api-error";
import { allow } from "@/lib/ratelimit";
import { auctionEnabled, auctionErrorKey, auctionErrorStatus } from "@/lib/auction";
import type { Lang } from "@/lib/i18n";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

type Ctx = { lang: Lang; supabase: Awaited<ReturnType<typeof createServerSupabase>>; userId: string | null };

/** 플래그·로그인·요청 수를 본다. 막히면 응답, 통과하면 컨텍스트 */
export async function auctionCtx(req: Request, opts: { login?: boolean; rate?: [string, number] } = {}): Promise<NextResponse | Ctx> {
  const lang = reqLang(req);
  if (!auctionEnabled()) return apiError(lang, "auction.err.off", 404);
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  if (opts.login !== false && !userId) return apiError(lang, "auction.err.login", 401);
  if (opts.rate && userId && !allow(`${opts.rate[0]}:${userId}`, opts.rate[1])) return apiError(lang, "auction.err.tooMany429", 429);
  return { lang, supabase, userId };
}

/** RPC 오류 → 사용자 언어 문구 + 상태 코드({ error, code }) */
export function rpcFail(lang: Lang, message: string) {
  const k = auctionErrorKey(message);
  return apiError(lang, k, auctionErrorStatus(k));
}