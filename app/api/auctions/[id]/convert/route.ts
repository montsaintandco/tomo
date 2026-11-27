import { NextResponse } from "next/server";
import { auctionCtx, rpcFail, validUuid } from "@/lib/auction-server";
import { apiError } from "@/lib/api-error";

// 일반 판매로 전환(0047 convert_to_fixed). POST { price } → { listing }(sale_type = fixed, 공개)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await auctionCtx(req, { rate: ["auction-seller", 30] });
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  const { price } = await req.json().catch(() => ({}));
  if (!validUuid(id) || !Number.isInteger(price) || price <= 0) return apiError(c.lang, "auction.err.amount", 400);
  const { data, error } = await c.supabase.rpc("convert_to_fixed", { p_auction: id, p_price: price });
  if (error) return rpcFail(c.lang, error.message);
  return NextResponse.json({ listing: data });
}