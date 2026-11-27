import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { t } from "@/lib/i18n";
import { apiError, reqLang } from "@/lib/api-error";
import { allow } from "@/lib/ratelimit";
import { loadItem } from "@/lib/market/item";
import { SOURCE_CURRENCY, type MarketSource } from "@/lib/market/types";
import { bidFacts, marketBidEnabled, mbErrorKey, minCapJpy } from "@/lib/market-bid";
import { openBidCheckout, releaseAuth } from "@/lib/market-bid.server";

export const runtime = "nodejs";

// 해외 마켓 경매 입찰 신청(docs/aaa/15 M2). 플래그 NEXT_PUBLIC_MARKET_AUCTION=1 이 아니면 404.
// POST: 마켓을 서버가 다시 읽고(현재가·입찰 수·마감·송료) → request_market_bid(가드·금액은 DB) → 승인만 하는 결제창 URL.
// body = { source, sourceId, capJpy, requestId(uuid), seenPrice?, ship: { name, phone, postal, address, note, pccc }, addressId? }
// DELETE: { bidId } 입찰 전(결제창 대기·승인됨)만 취소 → 승인 해제.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCES: MarketSource[] = ["mercari"];
const s = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  if (!marketBidEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const lang = reqLang(req);
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return apiError(lang, "pay.err.unauthorized", 401);
  const stripe = getStripe();
  if (!stripe) return apiError(lang, "mb.err.notReady", 503);

  const body = await req.json().catch(() => ({}));
  const source = body.source as MarketSource;
  const sourceId = s(body.sourceId, 64);
  const cap = Number(body.capJpy);
  const requestId = s(body.requestId, 64);
  if (!SOURCES.includes(source)) return apiError(lang, "mb.err.source");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(sourceId) || !Number.isInteger(cap) || cap <= 0 || !UUID.test(requestId)) return apiError(lang, "mb.err.failed");
  if (!allow(`mb:${auth.user.id}`, 6)) return apiError(lang, "pay.err.busy", 429); // 마켓을 다시 읽으므로 한도

  const admin = createAdminSupabase();
  const { data: profile } = await supabase.from("profiles").select("language").eq("id", auth.user.id).single();
  const ui = profile?.language === "ja" ? "ja" : lang;
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  // 같은 요청 번호 재요청: 마켓을 다시 읽지 않고 그 신청으로 이어 간다
  const { data: prev } = await admin.from("market_bids").select("id, code, status, auth_krw, source, source_id")
    .eq("user_id", auth.user.id).eq("request_id", requestId).maybeSingle();
  let bid = prev;
  if (!bid) {
    const live = await loadItem(source, sourceId);
    const facts = bidFacts(source, live);
    if ("error" in facts || !live) return apiError(ui, "error" in facts ? facts.error : "mb.err.changed", 409);
    const seen = Number(body.seenPrice);
    if (Number.isFinite(seen) && seen > 0 && seen !== facts.price) {
      return NextResponse.json({ error: t(ui, "mb.err.changed"), code: "mb.err.changed", facts }, { status: 409 });
    }
    // 경매 상품 행: 없으면 만든다. fetched_at=epoch 로 두어 장바구니 주문(15분 신선도)이 이 행을 믿지 못하게 한다(B0 차단 유지)
    let item = (await admin.from("external_items").select("id").eq("source", source).eq("source_id", sourceId).maybeSingle()).data;
    if (!item) {
      const ins = await admin.from("external_items").upsert({
        source, source_id: sourceId, url: live.url, title: live.title, price: Math.round(facts.price), currency: SOURCE_CURRENCY[source],
        images: live.images.slice(0, 8), seller_name: live.sellerName ?? "", status: "active", fetched_at: new Date(0).toISOString(),
      }, { onConflict: "source,source_id", ignoreDuplicates: true }).select("id").maybeSingle();
      item = ins.data ?? (await admin.from("external_items").select("id").eq("source", source).eq("source_id", sourceId).maybeSingle()).data;
      if (!item) return apiError(ui, "mb.err.failed", 503);
    }
    const ship = body.ship ?? {};
    const { data, error } = await admin.rpc("request_market_bid", {
      p_user: auth.user.id, p_request_id: requestId, p_external_item_id: item.id, p_cap_jpy: cap,
      p_seen_price: facts.price, p_bids: facts.bids, p_ends_at: facts.endsAt, p_ship_jpy: facts.shipJpy,
      p_ship_name: s(ship.name, 60), p_ship_phone: s(ship.phone, 30), p_ship_postal: s(ship.postal, 12), p_ship_address: s(ship.address),
      p_ship_note: s(ship.note), p_pccc: s(ship.pccc, 20), p_address_id: UUID.test(String(body.addressId ?? "")) ? body.addressId : null,
    });
    if (error) {
      const key = mbErrorKey(error.message);
      const { data: set } = await admin.from("market_bid_settings").select("cap_max_jpy").maybeSingle();
      return apiError(ui, key, key === "mb.err.notReady" || key === "mb.err.failed" ? 503 : 409,
        { min: minCapJpy(facts.price, facts.bids), max: set?.cap_max_jpy ?? 0 });
    }
    bid = data;
  }
  if (!bid) return apiError(ui, "mb.err.failed", 503);
  if (bid.status !== "pending_auth") return NextResponse.json({ bidId: bid.id, code: bid.code, status: bid.status });
  try {
    const url = await openBidCheckout(stripe, admin, {
      bid, name: t(ui, "mb.stripeName", { code: bid.code }), lang: ui, email: auth.user.email, origin,
    });
    return NextResponse.json({ url, bidId: bid.id, code: bid.code, authKrw: bid.auth_krw });
  } catch (e) {
    console.error("[market-bid] checkout", e instanceof Error ? e.message : e);
    return apiError(ui, "pay.err.session", 503);
  }
}

export async function DELETE(req: Request) {
  if (!marketBidEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const lang = reqLang(req);
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return apiError(lang, "pay.err.unauthorized", 401);
  const body = await req.json().catch(() => ({}));
  if (!UUID.test(String(body.bidId ?? ""))) return apiError(lang, "mb.err.failed");
  const { data, error } = await supabase.rpc("cancel_market_bid", { p_id: body.bidId });   // 본인 확인은 함수가 한다
  if (error) return apiError(lang, mbErrorKey(error.message), 409);
  const r = data as { release_auth_id?: string | null; expire?: string[] };
  const stripe = getStripe();
  if (stripe) {
    for (const sid of r.expire ?? []) await stripe.checkout.sessions.expire(sid).catch(() => {});
    // 해제 실패는 승인 행이 releasing 으로 남아 M3 크론이 다시 한다. 고객 취소 자체는 이미 확정이다
    if (r.release_auth_id) await releaseAuth(stripe, createAdminSupabase(), r.release_auth_id).catch((e) => console.error("[market-bid] release", e instanceof Error ? e.message : e));
  }
  return NextResponse.json({ ok: true });
}
