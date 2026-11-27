import { NextResponse } from "next/server";
import { auctionCtx, rpcFail, validUuid } from "@/lib/auction-server";
import { apiError } from "@/lib/api-error";

// 판매자 취소(0046 cancel_auction) — 입찰 0건일 때만. 상품은 숨김이 된다. POST → { auction }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await auctionCtx(req, { rate: ["auction-seller", 30] });
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  if (!validUuid(id)) return apiError(c.lang, "auction.err.notFound", 404);
  const { data, error } = await c.supabase.rpc("cancel_auction", { p_auction: id });
  if (error) return rpcFail(c.lang, error.message);
  return NextResponse.json({ auction: data });
}