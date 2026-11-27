import { NextResponse } from "next/server";
import { auctionCtx, rpcFail, validUuid } from "@/lib/auction-server";
import { apiError } from "@/lib/api-error";

// 경매 등록(0046 create_auction). 상품은 먼저 일반 등록(hidden=true 권장)한 뒤 이 API 로 경매로 바꾼다 — 성공하면 공개된다.
//   POST { listingId, startPrice, days(1|3|5|7) } → 201 { auction }
export async function POST(req: Request) {
  const c = await auctionCtx(req, { rate: ["auction-create", 20] });
  if (c instanceof NextResponse) return c;
  const { listingId, startPrice, days } = await req.json().catch(() => ({}));
  if (!validUuid(listingId) || !Number.isInteger(startPrice) || !Number.isInteger(days)) return apiError(c.lang, "auction.err.generic", 400);
  const { data, error } = await c.supabase.rpc("create_auction", { p_listing: listingId, p_start_price: startPrice, p_days: days });
  if (error) return rpcFail(c.lang, error.message);
  return NextResponse.json({ auction: data }, { status: 201 });
}