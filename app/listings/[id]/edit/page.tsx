import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import SellForm, { type SellInitial } from "@/components/SellForm";
import { notFound, redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { loadPriceLock, PRICE_LOCK_ERR } from "@/app/api/listings/price-lock";
import { auctionEditBlocked } from "@/lib/auction-server";
import Link from "next/link";

export const metadata = { title: "상품 수정 · 商品を編集", robots: { index: false } };

export default async function EditListingPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/listings/${id}/edit`);
  const { data: l } = await supabase.from("listings")
    .select("id, seller_id, title, description, price, category, trade_method, cross_border_enabled, condition, shipping_payer, ship_days, allow_offers, images, status, sale_type, ship_weight_kg")
    .eq("id", id).maybeSingle();
  if (!l || l.seller_id !== viewer.id) notFound();
  // 가격 잠금 안내 — 서버(PATCH)가 가격 변경을 409로 막는다. 폼은 일반 저장 실패 문구만 보여 주므로 이유는 여기서 먼저 알린다.
  const lock = await loadPriceLock(supabase, l.id, l.status);
  const lang = viewer.language;
  if (l.sale_type === "auction" && await auctionEditBlocked(supabase, l.id)) return (
    <main role="status" className="mx-auto max-w-md px-4 pt-8 text-center text-[14px] text-ink md:max-w-5xl">
      <p className="font-bold">{t(lang, "auction.err.editBids")}</p>
      <Link href={`/listings/${l.id}`} className="btn mt-4 inline-block bg-tomo-navy px-6 py-2.5 text-sm text-white">{t(lang, "auction.edit.back")}</Link>
    </main>
  );
  return (
    <>
      {lock && (
        <div role="status" className="mx-auto max-w-md px-4 pt-4 md:max-w-5xl md:px-6 md:pt-8">
          <div className="rounded-card border border-tomo-rose/30 bg-tomo-rose/5 px-4 py-3 text-[13px] text-tomo-navy">
            <p className="font-semibold text-tomo-rose">{t(lang, PRICE_LOCK_ERR[lock])}</p>
            <p className="mt-1">{t(lang, "pay.priceLock.hint")}</p>
          </div>
        </div>
      )}
      <SellForm lang={lang} hint="" initial={l as SellInitial} currency={viewer.currency} />
    </>
  );
}
