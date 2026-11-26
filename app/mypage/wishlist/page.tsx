import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import type { Currency } from "@/lib/currency";
import { formatMoney } from "@/lib/price-display";
import Price from "@/components/ui/Price";
import { t } from "@/lib/i18n";
import UnwishButton from "@/components/UnwishButton";
import { PageTitle, Row, Empty, More } from "@/components/mypage/MyNav";
import { pageLimit } from "@/lib/notifications";
import { redirect } from "next/navigation";

export const metadata = { title: "찜 · いいね | TOMO", robots: { index: false } };

type MiniListing = {
  id: string; title: string; price: number; currency: string; status: string; images: string[];
  source_language: string; listing_translations: { language: string; title: string }[];
};

// 찜 — 값내림 표시 + 해제 버튼. 20건씩 더보기
export default async function MyWishlist(props: { searchParams: Promise<{ page?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/wishlist");
  const lang = viewer.language;
  const { n, limit } = pageLimit(sp.page);
  const { data } = await supabase.from("wishlists")
    .select("listing_id, price_at_wish, listings(id, title, price, currency, status, images, source_language, listing_translations(language, title))")
    .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
  const all = (data ?? []) as unknown as { listing_id: string; price_at_wish: number | null; listings: MiniListing | null }[];
  const list = all.slice(0, limit).filter((w) => w.listings);
  const statusOf = (s: string) => t(lang, s === "active" ? "status.selling" : s === "reserved" ? "badge.reserved" : "status.soldDone");

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <PageTitle>{t(lang, "my.wishlist")}</PageTitle>
      <div className="flex flex-col gap-2">
        {list.map((w) => {
          const l = w.listings!;
          const drop = w.price_at_wish && l.price < w.price_at_wish
            ? `${t(lang, "my.priceDrop", { diff: formatMoney(w.price_at_wish - l.price, l.currency as Currency, lang) })} · ` : "";
          return (
            <Row key={l.id} href={`/listings/${l.id}`} image={l.images?.[0]} title={displayTitle(l, lang)}
              sub={drop + statusOf(l.status)} right={<Price className="items-end text-right" amount={l.price} currency={l.currency as Currency} viewerCurrency={viewer.currency}
                rate={viewer.rate} lang={lang} fallback={t(lang, "price.free")} dim={l.status !== "active" && l.status !== "reserved"} />} extra={<UnwishButton listingId={l.id} lang={lang} />} />
          );
        })}
        {list.length === 0 && <Empty text={t(lang, "my.noWishlist")} />}
      </div>
      <More lang={lang} href={all.length > limit ? `/mypage/wishlist?page=${n + 1}` : null} />
    </main>
  );
}
