import { orderLabel } from "@/lib/order-code";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, convertPrice, type Currency } from "@/lib/currency";
import { platformFee, sellerPayout, txChargeBase } from "@/lib/fees";
import { t, type Lang } from "@/lib/i18n";
import EscrowTimeline from "@/components/EscrowTimeline";
import TxActions from "@/components/TxActions";
import PayTxButton from "@/components/PayTxButton";
import ReviewForm from "@/components/ReviewForm";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import PayNotice from "@/components/PayNotice";
import { Suspense } from "react";
import { rows as safeRows } from "@/lib/safe";
import CenterShipGuide from "@/components/CenterShipGuide";
import InspectionList from "@/components/InspectionList";
import { loadInspections } from "@/lib/inspection";

type TxDetail = {
  id: string; code?: string | null; status: string; is_cross_border: boolean; meetup: boolean; center: string | null;
  buyer_id: string; seller_id: string;
  item_price: number; intl_shipping_fee: number; platform_fee: number; currency: Currency;
  customs_deposit: number; customs_actual: number | null; customs_settled_at: string | null; ship_overage: number;
  ship_weight_kg: number | null; measured_weight_kg: number | null;
  domestic_tracking: string | null; intl_tracking: string | null;
  dispute_reason: string | null; dispute_resolution: string | null;
  listings: {
    id: string; title: string; source_language: string; country: "KR" | "JP";
    images: string[]; listing_translations: { language: string; title: string }[];
  };
  buyer: { id: string; nickname: string };
  seller: { id: string; nickname: string };
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex justify-between gap-3 first:mt-0">
      <span className="text-ink-soft">{label}</span>
      <span className="tnum text-ink">{value}</span>
    </div>
  );
}

export default async function TransactionPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");
  const lang: Lang = viewer.language;

  const { data } = await supabase.from("transactions")
    .select(`id, code, status, is_cross_border, meetup, center, buyer_id, seller_id,
      item_price, intl_shipping_fee, platform_fee, currency, customs_deposit, customs_actual, customs_settled_at, ship_overage, ship_weight_kg, measured_weight_kg, domestic_tracking, intl_tracking, dispute_reason, dispute_resolution,
      listings!transactions_listing_id_fkey(id, title, source_language, country, images, listing_translations(language, title)),
      buyer:profiles!transactions_buyer_id_fkey(id, nickname),
      seller:profiles!transactions_seller_id_fkey(id, nickname)`)
    .eq("id", params.id).maybeSingle();
  if (!data) notFound(); // RLS: 거래 당사자가 아니면 여기서 차단

  const tx = data as unknown as TxDetail;
  const role: "buyer" | "seller" | "admin" | "other" =
    tx.buyer_id === viewer.id ? "buyer" : tx.seller_id === viewer.id ? "seller" : viewer.isAdmin ? "admin" : "other";
  const other = role === "buyer" ? tx.seller : tx.buyer;
  const l = tx.listings;
  const foreign = tx.currency !== viewer.currency;
  const isParty = role === "buyer" || role === "seller";
  const total = txChargeBase(tx);   // 0057: 통관 예치금 포함
  const payout = Math.max(0, sellerPayout(tx.item_price) - (tx.ship_overage ?? 0));   // 실측 무게 초과분은 판매자 정산에서 뺀다(credit_sale_on_complete)

  // 취소 사유·환불(0025) — 별도 조회, 마이그레이션 전에는 비어 있음. 판매자는 환불 행을 RLS로 못 봄
  const [cancelRes, refundRes] = tx.status === "cancelled"
    ? await Promise.all([
      supabase.from("transactions").select("cancel_reason").eq("id", tx.id),
      supabase.from("refunds").select("amount, currency, status").eq("kind", "tx").eq("is_full", true).eq("transaction_id", tx.id),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const cancelReason = (safeRows(cancelRes) as { cancel_reason: string | null }[])[0]?.cancel_reason ?? null;
  const refund = (safeRows(refundRes) as { amount: number; currency: Currency; status: string }[])[0];

  // 센터 경유 거래: 판매자 발송 안내(결제 완료 뒤)·센터 검수 기록(0054, 당사자 읽기 전용, 사진은 서명 URL)
  const viaCenter = tx.is_cross_border && !tx.meetup;
  const showGuide = viaCenter && role === "seller" && tx.status === "paid";
  const [addrRes, insp, refRes] = await Promise.all([
    showGuide && tx.center ? supabase.from("center_addresses").select("recipient, postal, address, phone").eq("center", tx.center).maybeSingle() : null,
    viaCenter && !["pending_payment", "paid", "shipped"].includes(tx.status) ? loadInspections(supabase, "tx", tx.id) : [],
    // 일본 센터 = 재팬비즈 입고 예정 번호(운영자가 넣은 뒤에만 주소가 완성된다, 0057 tx_center_ref)
    showGuide && tx.center === "NARITA" ? supabase.rpc("tx_center_ref", { p_tx: tx.id }) : null,
  ]);
  const centerRef = (refRes?.data as string | null | undefined) ?? null;
  const centerAddr = (addrRes?.data ?? null) as { recipient: string; postal: string | null; address: string; phone: string | null } | null;

  let alreadyReviewed = false;
  if (tx.status === "completed" && isParty) {
    const { data: mine } = await supabase.from("reviews")
      .select("id").eq("transaction_id", tx.id).eq("reviewer_id", viewer.id).maybeSingle();
    alreadyReviewed = !!mine;
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <Suspense fallback={null}><PayNotice lang={lang} /></Suspense>
      <h1 className="mb-1 text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "tx.title")}</h1>
      <p className="mb-3 text-[12px] text-ink-soft">{t(lang, "pay.orderNo")} <span className="tnum font-bold text-ink">{orderLabel(tx.code, tx.id)}</span></p>

      <Link href={`/listings/${l.id}`} className="card mb-4 flex items-center gap-3 p-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
          {l.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-6 w-9 opacity-60" /></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{displayTitle(l, lang)}</p>
          <p className="truncate text-xs text-ink-soft">
            {t(lang, role === "buyer" ? "tx.seller" : "tx.buyer")} · {other.nickname}
            {tx.is_cross_border && tx.center && ` · ${t(lang, "tx.centerVia", { center: t(lang, `center.${tx.center === "NARITA" ? "NARITA" : "SEOUL"}`) })}`}{tx.meetup && ` · ${t(lang, "tx.meetup")}`}
          </p>
        </div>
      </Link>

      <div className="card mb-4 p-4">
        <EscrowTimeline status={tx.status} isCrossBorder={tx.is_cross_border} meetup={tx.meetup} lang={lang} />
      </div>

      {(tx.dispute_reason || tx.dispute_resolution) && (
        <div className="mb-4 rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
          {tx.dispute_reason && <p><span className="font-bold text-tomo-rose">{t(lang, "dispute.reasonLabel")}:</span> {tx.dispute_reason}</p>}
          {tx.dispute_resolution && <p className="mt-1"><span className="font-bold text-tomo-navy">{t(lang, "dispute.resolution")}:</span> {tx.dispute_resolution}</p>}
          {tx.status === "disputed" && !tx.dispute_resolution && <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "dispute.opened")}</p>}
        </div>
      )}

      {(cancelReason || refund) && (
        <div className="mb-4 rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
          {cancelReason && <p><span className="font-bold">{t(lang, "refund.cancelReasonLabel")}:</span> {cancelReason}</p>}
          {refund && (
            <p className="mt-1 flex justify-between gap-3">
              <span className="text-ink-soft">{t(lang, "refund.amountLine")} · {t(lang, refund.status === "done" ? "refund.status.done" : "refund.status.pending")}</span>
              <span className="tnum font-bold text-tomo-navy">{formatPrice(refund.amount, refund.currency, lang)}</span>
            </p>
          )}
        </div>
      )}

      {/* 금액 — 결제 금액은 구매자 통화가 큰 숫자 */}
      <div className="card mb-4 p-4 text-[13px]">
        <Row label={t(lang, "ext.item")} value={formatPrice(tx.item_price, tx.currency, lang)} />
        {tx.is_cross_border && <Row label={t(lang, "tx.intlShipping")} value={formatPrice(tx.intl_shipping_fee, tx.currency, lang)} />}
        {role !== "seller" && tx.customs_deposit > 0 && <Row label={t(lang, "customs.depositLine")} value={formatPrice(tx.customs_deposit, tx.currency, lang)} />}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
          <span className="font-bold text-ink">{t(lang, role === "seller" ? "tx.payout" : "tx.total")}</span>
          <span className="text-right">
            <span className="tnum block text-[15px] font-extrabold text-tomo-navy">
              {role === "seller"
                ? formatPrice(payout, tx.currency, lang)
                : foreign
                  ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(total, tx.currency, viewer.rate), viewer.currency, lang)}`
                  : formatPrice(total, tx.currency, lang)}
            </span>
            {role !== "seller" && foreign && (
              <span className="tnum block text-[11px] font-bold text-ink-soft">{formatPrice(total, tx.currency, lang)}</span>
            )}
          </span>
        </div>
        {role === "seller" && (
          <p className="mt-1 text-right text-[11px] text-ink-faint">
            {t(lang, "tx.feeNote", { fee: formatPrice(platformFee(tx.item_price), tx.currency, lang) })}
          </p>
        )}
        {role === "seller" && tx.ship_overage > 0 && (
          <p className="mt-1 text-right text-[11px] font-bold text-tomo-rose">
            {t(lang, "ship.overageNote", { amount: formatPrice(tx.ship_overage, tx.currency, lang), kg: String(tx.measured_weight_kg ?? ""), declared: String(tx.ship_weight_kg ?? "") })}
          </p>
        )}
        {role !== "seller" && tx.customs_deposit > 0 && (
          <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
            {tx.customs_settled_at
              ? t(lang, "customs.settled", { actual: formatPrice(tx.customs_actual ?? 0, tx.currency, lang), back: formatPrice(Math.max(0, tx.customs_deposit - (tx.customs_actual ?? 0)), tx.currency, lang) })
              : t(lang, "customs.pending")}
          </p>
        )}
      </div>

      {(tx.domestic_tracking || tx.intl_tracking) && (
        <dl className="card mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-4 text-xs text-ink-soft">
          {tx.domestic_tracking && <><dt className="font-bold text-ink">{t(lang, "tx.domesticTracking")}</dt><dd className="tnum">{tx.domestic_tracking}</dd></>}
          {tx.intl_tracking && <><dt className="font-bold text-ink">{t(lang, "tx.intlTracking")}</dt><dd className="tnum">{tx.intl_tracking}</dd></>}
        </dl>
      )}

      {(insp === null || insp.length > 0) && (
        <section className="mb-4">
          <h2 className="mb-1 text-[14px] font-bold text-ink">{t(lang, "insp.title")}</h2>
          <p className="mb-2 text-[12px] text-ink-soft">{t(lang, "insp.sub")}</p>
          <InspectionList items={insp ?? []} failed={insp === null} lang={lang} admin={role === "admin"} />
        </section>
      )}

      {showGuide && <CenterShipGuide addr={centerAddr} center={tx.center === "NARITA" ? "NARITA" : "SEOUL"} centerRef={centerRef} code={orderLabel(tx.code, tx.id)} lang={lang} />}
      {role === "buyer" && tx.status === "pending_payment" && <div className="mb-2"><PayTxButton txId={tx.id} lang={lang} /></div>}
      <TxActions txId={tx.id} status={tx.status} isCrossBorder={tx.is_cross_border} meetup={tx.meetup} role={role} lang={lang} />

      {tx.status === "completed" && isParty && (
        <div className="mt-4">
          {alreadyReviewed
            ? <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-sm text-ink-soft">{t(lang, "tx.reviewed")}</p>
            : <ReviewForm txId={tx.id} lang={lang} />}
        </div>
      )}
    </main>
  );
}
