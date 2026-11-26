import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { t } from "@/lib/i18n";
import { PageTitle, Tabs, Row, Empty, More } from "@/components/mypage/MyNav";
import { pageLimit } from "@/lib/notifications";
import { redirect } from "next/navigation";

export const metadata = { title: "가격제안 · 希望価格 | TOMO", robots: { index: false } };

type MiniListing = {
  id: string; title: string; price: number; currency: string; status: string; images: string[];
  source_language: string; listing_translations: { language: string; title: string }[];
};
type OfferStatus = "pending" | "accepted" | "declined";
const LISTING_SEL = "id, title, price, currency, status, images, source_language, listing_translations(language, title)";

// 가격제안 — 받은(tab=in, 기본: 내 상품에 온 것) / 보낸(tab=out). 20건씩 더보기
export default async function MyOffers(props: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/offers");
  const lang = viewer.language;
  const tab = sp.tab === "out" ? "out" : "in";
  const { n, limit } = pageLimit(sp.page);
  const more = (has: boolean) => (has ? `/mypage/offers?tab=${tab}&page=${n + 1}` : null);

  let body: React.ReactNode;
  if (tab === "in") {
    // RLS: seller reads offers on own listings
    const { data } = await supabase.from("offers")
      .select(`id, price, status, created_at, listings!inner(${LISTING_SEL}, seller_id), profiles!offers_buyer_id_fkey(nickname)`)
      .eq("listings.seller_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
    type OfferIn = { id: string; price: number; status: OfferStatus; listings: MiniListing; profiles: { nickname: string } | null };
    const list = ((data ?? []) as unknown as OfferIn[]).slice(0, limit);
    body = (
      <>
        <div className="flex flex-col gap-2">
          {list.map((o) => (
            <Row key={o.id} href={`/listings/${o.listings.id}`} image={o.listings.images?.[0]} title={displayTitle(o.listings, lang)}
              sub={`${o.profiles?.nickname ?? "—"} · ${t(lang, `offers.status.${o.status}`)}`}
              right={formatPrice(o.price, o.listings.currency as Currency, lang)} />
          ))}
          {list.length === 0 && <Empty text={t(lang, "my.noOffers")} />}
        </div>
        <More lang={lang} href={more((data ?? []).length > limit)} />
      </>
    );
  } else {
    const { data } = await supabase.from("offers")
      .select(`id, price, status, created_at, listings(${LISTING_SEL})`)
      .eq("buyer_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
    type OfferOut = { id: string; price: number; status: OfferStatus; listings: MiniListing | null };
    const list = ((data ?? []) as unknown as OfferOut[]).slice(0, limit).filter((o) => o.listings);
    body = (
      <>
        <div className="flex flex-col gap-2">
          {list.map((o) => (
            <Row key={o.id} href={`/listings/${o.listings!.id}`} image={o.listings!.images?.[0]} title={displayTitle(o.listings!, lang)}
              sub={t(lang, `offers.status.${o.status}`)} right={formatPrice(o.price, o.listings!.currency as Currency, lang)} />
          ))}
          {list.length === 0 && <Empty text={t(lang, "my.noOffers")} />}
        </div>
        <More lang={lang} href={more((data ?? []).length > limit)} />
      </>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <PageTitle>{t(lang, "my.nav.offers")}</PageTitle>
      <Tabs tabs={[
        { href: "/mypage/offers", label: t(lang, "my.offersIn"), active: tab === "in" },
        { href: "/mypage/offers?tab=out", label: t(lang, "my.offersOut"), active: tab === "out" },
      ]} />
      {body}
    </main>
  );
}
