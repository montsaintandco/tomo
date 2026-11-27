import { NextResponse } from "next/server";
import { auctionCtx, rpcFail, validUuid } from "@/lib/auction-server";
import { apiError } from "@/lib/api-error";

// 입찰(0046 place_bid). amount = 내 상한가(상품 통화). requestId = 화면이 입찰 창마다 만든 번호(같은 번호 재전송은 처음 결과).
//   POST { amount, requestId } → { result: BidResult, state: AuctionState }  (state 로 바로 다시 그린다)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await auctionCtx(req, { rate: ["auction-bid", 30] });
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  const { amount, requestId } = await req.json().catch(() => ({}));
  if (!validUuid(id) || !Number.isInteger(amount)) return apiError(c.lang, "auction.err.amount", 400);
  if (requestId != null && (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 64)) return apiError(c.lang, "auction.err.generic", 400);
  const { data, error } = await c.supabase.rpc("place_bid", { p_auction: id, p_amount: amount, p_request_id: requestId ?? null });
  if (error) return rpcFail(c.lang, error.message);
  const { data: state } = await c.supabase.rpc("auction_state", { p_id: id });
  return NextResponse.json({ result: data, state });
}