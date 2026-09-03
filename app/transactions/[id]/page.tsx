import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, convertPrice, type Currency } from "@/lib/currency";
import { platformFee, buyerTotal, sellerPayout } from "@/lib/fees";
import { t, type Lang } from "@/lib/i18n";
import EscrowTimeline from "@/components/EscrowTimeline";
import TxActions from "@/components/TxActions";
import ReviewForm from "@/components/ReviewForm";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type TxDetail = {
  id: string; status: string; is_cross_border: boolean; center: string | null;
  buyer_id: string; seller_id: string;
  item_price: number; intl_shipping_fee: number; platform_fee: number; currency: Currency;
  domestic_tracking: string | null; intl_tracking: string | null;
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
    .select(`id, status, is_cross_border, center, buyer_id, seller_id,
      item_price, intl_shipping_fee, platform_fee, currency, domestic_tracking, intl_tracking,
      listings(id, title, source_language, country, images, listing_translations(language, title)),
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
  const total = buyerTotal(tx.item_price, tx.is_cross_border ? tx.intl_shipping_fee : 0);

  let alreadyReviewed = false;
  if (tx.status === "completed" && isParty) {
    const { data: mine } = await supabase.from("reviews")
      .select("id").eq("transaction_id", tx.id).eq("reviewer_id", viewer.id).maybeSingle();
    alreadyReviewed = !!mine;
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-3 text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "tx.title")}</h1>

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
            {tx.is_cross_border && tx.center && ` · ${t(lang, "tx.centerVia", { center: t(lang, `center.${tx.center === "NARITA" ? "NARITA" : "SEOUL"}`) })}`}
          </p>
        </div>
      </Link>

      <div className="card mb-4 p-4">
        <EscrowTimeline status={tx.status} isCrossBorder={tx.is_cross_border} lang={lang} />
      </div>

      {/* 금액 — 결제 금액은 구매자 통화가 큰 숫자 */}
      <div className="card mb-4 p-4 text-[13px]">
        <Row label={t(lang, "ext.item")} value={formatPrice(tx.item_price, tx.currency)} />
        {tx.is_cross_border && <Row label={t(lang, "tx.intlShipping")} value={formatPrice(tx.intl_shipping_fee, tx.currency)} />}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
          <span className="font-bold text-ink">{t(lang, role === "seller" ? "tx.payout" : "tx.total")}</span>
          <span className="text-right">
            <span className="tnum block text-[15px] font-extrabold text-tomo-navy">
              {role === "seller"
                ? formatPrice(sellerPayout(tx.item_price), tx.currency)
                : foreign
                  ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(total, tx.currency, viewer.rate), viewer.currency)}`
                  : formatPrice(total, tx.currency)}
            </span>
            {role !== "seller" && foreign && (
              <span className="tnum block text-[11px] font-bold text-ink-soft">{formatPrice(total, tx.currency)}</span>
            )}
          </span>
        </div>
        {role === "seller" && (
          <p className="mt-1 text-right text-[11px] text-ink-faint">
            {t(lang, "tx.feeNote", { fee: formatPrice(platformFee(tx.item_price), tx.currency) })}
          </p>
        )}
      </div>

      {(tx.domestic_tracking || tx.intl_tracking) && (
        <dl className="card mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-4 text-xs text-ink-soft">
          {tx.domestic_tracking && <><dt className="font-bold text-ink">{t(lang, "tx.domesticTracking")}</dt><dd className="tnum">{tx.domestic_tracking}</dd></>}
          {tx.intl_tracking && <><dt className="font-bold text-ink">{t(lang, "tx.intlTracking")}</dt><dd className="tnum">{tx.intl_tracking}</dd></>}
        </dl>
      )}

      <TxActions txId={tx.id} status={tx.status} isCrossBorder={tx.is_cross_border} role={role} lang={lang} />

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
