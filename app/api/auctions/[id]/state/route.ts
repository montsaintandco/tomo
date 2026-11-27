import { NextResponse } from "next/server";
import { auctionCtx, rpcFail, validUuid } from "@/lib/auction-server";
import { apiError } from "@/lib/api-error";

// 폴링용 가벼운 조회(0046 auction_state). id = 경매 id 또는 상품 id. 로그인 없이도 공개 정보는 온다.
//   GET → { state: AuctionState }(lib/auction.ts). server_now 로 카운트다운을 맞춘다. 간격은 pollMs(state)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await auctionCtx(req, { login: false });
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  if (!validUuid(id)) return apiError(c.lang, "auction.err.notFound", 404);
  const { data, error } = await c.supabase.rpc("auction_state", { p_id: id });
  if (error) return rpcFail(c.lang, error.message);
  if (!data) return apiError(c.lang, "auction.err.notFound", 404);
  return NextResponse.json({ state: data }, { headers: { "cache-control": "no-store" } });
}