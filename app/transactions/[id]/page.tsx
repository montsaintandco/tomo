import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, formatWithConversion, type Currency } from "@/lib/currency";
import { platformFee, buyerTotal, sellerPayout } from "@/lib/fees";
import EscrowTimeline from "@/components/EscrowTimeline";
import TxActions from "@/components/TxActions";
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

export default async function TransactionPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");

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

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-tomo-navy">거래 진행 · 取引</h1>

      <Link href={`/listings/${l.id}`}
        className="mb-4 flex items-center gap-3 rounded-card border bg-white p-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-card bg-gray-100">
          {l.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{displayTitle(l, viewer.language)}</p>
          <p className="text-xs text-gray-500">
            {role === "buyer" ? "판매자" : "구매자"} · {other.nickname}
            {tx.is_cross_border && tx.center && ` · ${tx.center === "NARITA" ? "나리타" : "서울"} 센터`}
          </p>
        </div>
      </Link>

      <div className="mb-4 rounded-card border bg-white p-4">
        <EscrowTimeline status={tx.status} isCrossBorder={tx.is_cross_border} lang={viewer.language} />
      </div>

      <div className="mb-4 rounded-card border bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">상품가</span>
          <span>{formatPrice(tx.item_price, tx.currency)}</span>
        </div>
        {tx.is_cross_border && (
          <div className="mt-1 flex justify-between">
            <span className="text-gray-500">국제배송비</span>
            <span>{formatPrice(tx.intl_shipping_fee, tx.currency)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t pt-2 font-bold">
          <span>{role === "seller" ? "정산 예정액" : "결제 금액"}</span>
          <span className="text-tomo-navy">
            {role === "seller"
              ? formatPrice(sellerPayout(tx.item_price), tx.currency)
              : formatWithConversion(
                  buyerTotal(tx.item_price, tx.is_cross_border ? tx.intl_shipping_fee : 0),
                  tx.currency, foreign ? viewer.rate : 1, viewer.currency)}
          </span>
        </div>
        {role === "seller" && (
          <p className="mt-1 text-right text-[10px] text-gray-400">
            플랫폼 수수료 10% ({formatPrice(platformFee(tx.item_price), tx.currency)}) 차감
          </p>
        )}
      </div>

      {(tx.domestic_tracking || tx.intl_tracking) && (
        <div className="mb-4 rounded-card border bg-white p-4 text-xs text-gray-600">
          {tx.domestic_tracking && <p>국내 운송장: {tx.domestic_tracking}</p>}
          {tx.intl_tracking && <p className="mt-1">국제 운송장: {tx.intl_tracking}</p>}
        </div>
      )}

      <TxActions txId={tx.id} status={tx.status} isCrossBorder={tx.is_cross_border} role={role} />

      {tx.status === "completed" && (
        <p className="mt-4 rounded-card bg-tomo-ivory p-3 text-center text-sm text-gray-500">
          거래가 완료되었습니다 · 후기를 남겨보세요 (준비 중)
        </p>
      )}
    </main>
  );
}
