import { NextResponse } from "next/server";
import { auctionCtx, rpcFail, validUuid } from "@/lib/auction-server";
import { apiError } from "@/lib/api-error";

// 다시 경매(0047 relist_auction) — 유찰·미결제·취소 경매를 같은 시작가·기간으로. POST → 201 { auction }(새 경매, relist_of = 옛 id)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await auctionCtx(req, { rate: ["auction-seller", 30] });
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  if (!validUuid(id)) return apiError(c.lang, "auction.err.notFound", 404);
  const { data, error } = await c.supabase.rpc("relist_auction", { p_auction: id });
  if (error) return rpcFail(c.lang, error.message);
  return NextResponse.json({ auction: data }, { status: 201 });
}