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
import { rows, tableMissing } from "@/lib/safe";
import type { MarketSource } from "@/lib/market/types";
import ExternalUnwish from "./ExternalUnwish";

export const metadata = { title: "찜 · いいね", robots: { index: false } };

type MiniListing = {
  id: string; title: string; price: number; currency: string; status: string; images: string[];
  source_language: string; listing_translations: { language: string; title: string }[];
};

type ExtWish = { source: MarketSource; source_id: string; title: string; price: number; currency: Currency; thumb: string };

// 찜 — 값내림 표시 + 해제 버튼. 20건씩 더보기.
// 아래 「해외 상품」 묶음은 0038 external_wishlists(찜할 때 스냅샷). 표가 아직 없으면 묶음째 숨긴다. 더보기는 gpage 로 따로
export default async function MyWishlist(props: { searchParams: Promise<{ page?: string; gpage?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/wishlist");
  const lang = viewer.language;
  const { n, limit } = pageLimit(sp.page);
  const g = pageLimit(sp.gpage);
  const [{ data }, extRes] = await Promise.all([
    supabase.from("wishlists")
      .select("listing_id, price_at_wish, listings(id, title, price, currency, status, images, source_language, listing_translations(language, title))")
      .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1),
    supabase.from("external_wishlists").select("source, source_id, title, price, currency, thumb")
      .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(g.limit + 1),
  ]);
  const extReady = !tableMissing(extRes.error);
  const extAll = rows(extRes as { data: ExtWish[] | null; error: { code?: string } | null });
  const ext = extAll.slice(0, g.limit);
  const qs = (page: number, gpage: number) => `/mypage/wishlist?${new URLSearchParams({ ...(page > 1 ? { page: String(page) } : {}), ...(gpage > 1 ? { gpage: String(gpage) } : {}) })}`;
  const all = (data ?? []) as unknown as { listing_id: string; price_at_wish: number | null; listings: MiniListing | null }[];
  const list = all.slice(0, limit).filter((w) => w.listings);
  const statusOf = (s: string) => t(lang, s === "active" ? "status.selling" : s === "reserved" ? "badge.reserved" : s === "held" ? "badge.paused" : "status.soldDone");

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
      <More lang={lang} href={all.length > limit ? qs(n + 1, g.n) : null} />

      {extReady && (
        <section className="mt-8" aria-labelledby="wish-global">
          <h2 id="wish-global" className="mb-3 text-[15px] font-extrabold text-ink">{t(lang, "search.wishGlobal")}</h2>
          <div className="flex flex-col gap-2">
            {ext.map((w) => (
              <Row key={`${w.source}:${w.source_id}`} href={`/global/${w.source}/${w.source_id}`} image={w.thumb || undefined} title={w.title || w.source_id}
                sub={`${t(lang, `source.${w.source}`)} · ${t(lang, "search.wishPriceAt")}`}
                right={<Price className="items-end text-right" amount={w.price} currency={w.currency} viewerCurrency={viewer.currency} rate={viewer.rate} lang={lang} />}
                extra={<ExternalUnwish source={w.source} sourceId={w.source_id} lang={lang} />} />
            ))}
            {ext.length === 0 && <Empty text={t(lang, "search.noWishGlobal")} />}
          </div>
          <More lang={lang} href={extAll.length > g.limit ? qs(n, g.n + 1) : null} />
        </section>
      )}
    </main>
  );
}
