import { NextResponse } from "next/server";
import { auctionCtx, validUuid } from "@/lib/auction-server";
import { apiError } from "@/lib/api-error";
import { POST as checkout } from "@/app/api/checkout/route";

// 낙찰자 「결제하기」 — /api/checkout 에 auctionId 로 넘긴다(결제창 생성·재사용·10분 규칙·금액 대조가 한 곳).
//   POST → { url, transactionId }(Stripe 결제창) | { error, code }
const fwd = (req: Request) => { const h = new Headers({ "content-type": "application/json" }); for (const k of ["cookie", "accept-language", "origin"]) { const v = req.headers.get(k); if (v) h.set(k, v); } return h; };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await auctionCtx(req, { rate: ["auction-pay", 20] });
  if (c instanceof NextResponse) return c;
  const { id } = await ctx.params;
  if (!validUuid(id)) return apiError(c.lang, "auction.err.notFound", 404);
  return checkout(new Request(req.url, { method: "POST", headers: fwd(req), body: JSON.stringify({ auctionId: id }) }));
}