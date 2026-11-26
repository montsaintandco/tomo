import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { t } from "@/lib/i18n";
import ListingOwnerActions from "@/components/ListingOwnerActions";
import { PageTitle, Tabs, Row, Empty, More } from "@/components/mypage/MyNav";
import { pageLimit, TX_STATUS } from "@/lib/notifications";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "판매 · 販売", robots: { index: false } };

type MiniListing = { title: string; source_language: string; images: string[]; listing_translations: { language: string; title: string }[] };

// 판매 — 내 상품(tab=listings, 기본, 상품 관리 버튼 포함) / 판매 거래(tab=tx). 20건씩 더보기
export default async function MySales(props: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/sales");
  const lang = viewer.language;
  const tab = sp.tab === "tx" ? "tx" : "listings";
  const { n, limit } = pageLimit(sp.page);
  const more = (has: boolean) => (has ? `/mypage/sales?tab=${tab}&page=${n + 1}` : null);
  const priceOf = (l: { price: number; currency: string }) => l.price === 0 ? t(lang, "price.free") : formatPrice(l.price, l.currency as Currency, lang);
  const statusOf = (s: string) => t(lang, s === "active" ? "status.selling" : s === "reserved" ? "badge.reserved" : "status.soldDone");

  let body: React.ReactNode;
  if (tab === "listings") {
    const { data } = await supabase.from("listings")
      .select("id, title, price, currency, status, images, hidden, hidden_by_admin")
      .eq("seller_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
    const list = (data ?? []).slice(0, limit);
    body = (
      <>
        <div className="flex flex-col gap-2">
          {list.map((l) => (
            <div key={l.id} className="card p-3">
              <Row href={`/listings/${l.id}`} image={(l.images as string[])?.[0]} title={l.title} bare
                sub={`${statusOf(l.status)}${l.hidden ? ` · ${t(lang, "own.hidden")}` : ""}`} right={priceOf(l)} />
              <ListingOwnerActions listingId={l.id} status={l.status} hidden={!!l.hidden} hiddenByAdmin={!!l.hidden_by_admin} lang={lang} />
            </div>
          ))}
          {list.length === 0 && <Empty text={t(lang, "profile.noListings")} />}
        </div>
        <More lang={lang} href={more((data ?? []).length > limit)} />
      </>
    );
  } else {
    const { data } = await supabase.from("transactions")
      .select("id, status, item_price, currency, listings(title, source_language, images, listing_translations(language, title))")
      .eq("seller_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
    const list = (data ?? []).slice(0, limit);
    body = (
      <>
        <div className="flex flex-col gap-2">
          {list.map((tx) => {
            const l = tx.listings as unknown as MiniListing | null;
            return (
              <Row key={tx.id} href={`/transactions/${tx.id}`} image={l?.images?.[0]} title={l ? displayTitle(l, lang) : t(lang, "my.item")}
                sub={TX_STATUS[tx.status] ? t(lang, TX_STATUS[tx.status]) : tx.status}
                right={formatPrice(tx.item_price, tx.currency as Currency, lang)} />
            );
          })}
          {list.length === 0 && <Empty text={t(lang, "my.noSalesTx")} />}
        </div>
        <More lang={lang} href={more((data ?? []).length > limit)} />
      </>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <div className="flex items-baseline justify-between">
        <PageTitle>{t(lang, "my.nav.sales")}</PageTitle>
        <Link href="/sell" className="press text-[13px] font-bold text-tomo-coral-deep">{t(lang, "my.sellNew")}</Link>
      </div>
      <Tabs tabs={[
        { href: "/mypage/sales", label: t(lang, "my.selling"), active: tab === "listings" },
        { href: "/mypage/sales?tab=tx", label: t(lang, "my.salesTx"), active: tab === "tx" },
      ]} />
      {body}
    </main>
  );
}
