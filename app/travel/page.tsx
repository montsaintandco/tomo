import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { t, otherCountry, type Lang } from "@/lib/i18n";
import TripForm, { type Trip } from "@/components/TripForm";
import ListingCard from "@/components/ListingCard";
import type { FeedListing } from "@/components/ListingRow";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";

export const metadata = { title: "여행 직거래 · 旅行で直接取引 | TOMO" };

const CARD_SELECT = "id, title, price, currency, source_language, country, region, status, images, created_at, trade_method, cross_border_enabled, listing_translations(language, title)";

// 여행 직거래 허브: 내 여행 일정 → 그 동네에서 만나 받을 수 있는 상품. 국제배송비 0원이 이 페이지의 이유
export default async function TravelPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const lang: Lang = viewer.language;
  const dest = otherCountry(viewer.country);

  const { data: tripRows } = viewer.guest
    ? { data: [] as Trip[] }
    : await supabase.from("trips").select("id, country, region, start_date, end_date, note")
        .eq("user_id", viewer.id).gte("end_date", new Date().toISOString().slice(0, 10)).order("start_date");
  const trips = (tripRows ?? []) as Trip[];
  const regions = Array.from(new Set(trips.map((tr) => tr.region)));

  // 일정이 있으면 그 동네 우선, 없으면 상대국 직거래 전체
  let q = supabase.from("listings").select(CARD_SELECT).eq("status", "active").eq("country", dest)
    .in("trade_method", ["direct", "both"]).order("bumped_at", { ascending: false }).limit(24);
  if (regions.length > 0) q = q.in("region", regions);
  const { data: matched } = await q;
  const { data: others } = regions.length > 0 && (matched ?? []).length < 6
    ? await supabase.from("listings").select(CARD_SELECT).eq("status", "active").eq("country", dest)
        .in("trade_method", ["direct", "both"]).order("bumped_at", { ascending: false }).limit(12)
    : { data: null };

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-5xl md:px-6 md:pb-16 md:pt-8 md:grid md:grid-cols-[minmax(0,22rem)_1fr] md:gap-10 md:items-start">
      <div>
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "trip.title")}</h1>
        <p className="mb-4 mt-1 text-[13px] leading-relaxed text-ink-soft">{t(lang, "trip.sub")}</p>
        {viewer.guest ? (
          <Link href="/login?next=/travel" className="btn inline-block bg-tomo-navy px-6 py-2.5 text-sm text-white">{t(lang, "detail.loginCta")}</Link>
        ) : (
          <TripForm lang={lang} dest={dest} trips={trips} />
        )}
      </div>

      <section className="mt-8 md:mt-0">
        <h2 className="mb-3 text-[15px] font-extrabold text-ink">
          {t(lang, "trip.matches", { region: regions.length > 0 ? regions.join(" · ") : t(lang, `market.${dest}`) })}
        </h2>
        {(matched ?? []).length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4">
            {(matched ?? []).map((l) => <li key={l.id}><ListingCard listing={l as unknown as FeedListing} viewer={viewer} /></li>)}
          </ul>
        ) : (
          <div className="flex flex-col items-center rounded-card bg-tomo-navy/5 px-6 py-8 text-center">
            <TomoSymbol className="h-12 w-[4.5rem] opacity-70" />
            <p className="mt-3 text-sm text-ink-soft">{t(lang, "trip.matchesNone")}</p>
          </div>
        )}
        {(others ?? []).length > 0 && (
          <>
            <h3 className="mb-3 mt-8 text-[15px] font-extrabold text-ink">{t(lang, "hub.travel", { market: t(lang, `market.${dest}`) })}</h3>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4">
              {(others ?? []).filter((l) => !(matched ?? []).some((m) => m.id === l.id)).map((l) => (
                <li key={l.id}><ListingCard listing={l as unknown as FeedListing} viewer={viewer} /></li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
