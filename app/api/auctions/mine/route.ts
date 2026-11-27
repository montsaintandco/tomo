import { NextResponse } from "next/server";
import { auctionCtx, rpcFail } from "@/lib/auction-server";

// 내가 입찰한 경매(0046 my_auction_bids): [{ id, code, listing_id, status, currency, current_price, bid_count, ends_at,
//   pay_due_at, final_price, my_max, leading, won, title, image }] — 마이페이지 「입찰 중·낙찰」
export async function GET(req: Request) {
  const c = await auctionCtx(req);
  if (c instanceof NextResponse) return c;
  const { data, error } = await c.supabase.rpc("my_auction_bids", { p_limit: 100 });
  if (error) return rpcFail(c.lang, error.message);
  return NextResponse.json({ items: data ?? [] }, { headers: { "cache-control": "no-store" } });
}