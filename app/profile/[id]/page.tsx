import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import HeartGauge from "@/components/HeartGauge";
import SellerStats, { type SellerStatsData } from "@/components/SellerStats";
import SectionHeader from "@/components/SectionHeader";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import AdminDeleteReview from "@/components/AdminDeleteReview";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

const HEART = "M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z";

type Review = {
  id: string; rating: number; comment: string; created_at: string;
  reviewer: { nickname: string } | null;
};

export default async function ProfilePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  if (params.id === "me" && (viewer.guest || !viewer.id)) redirect("/login?next=/profile/me");
  const targetId = params.id === "me" ? viewer.id! : params.id;
  const lang: Lang = viewer.language;

  const { data: p } = await supabase.from("profiles")
    .select("id, nickname, country, region, trust_temp").eq("id", targetId).maybeSingle();
  if (!p) notFound();

  const { data: listings } = await supabase.from("listings")
    .select("id, title, price, currency, status, images")
    .eq("seller_id", targetId).order("created_at", { ascending: false }).limit(20);

  // 받은 후기 = 이 거래의 상대가 남긴 후기 (reviewer가 본인이 아닌 것)
  const { data: reviewsRaw } = await supabase.from("reviews")
    .select(`id, rating, comment, created_at,
      reviewer:profiles!reviews_reviewer_id_fkey(nickname),
      transactions!inner(buyer_id, seller_id)`)
    .neq("reviewer_id", targetId)
    .or(`buyer_id.eq.${targetId},seller_id.eq.${targetId}`, { referencedTable: "transactions" })
    .order("created_at", { ascending: false }).limit(20);
  const reviews = (reviewsRaw ?? []) as unknown as Review[];
  const { data: statsRaw } = await supabase.rpc("seller_stats", { uid: targetId });
  const stats = (statsRaw ?? null) as SellerStatsData | null;

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <div className="card mb-6 p-4 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tomo-navy/5 text-[17px] font-extrabold text-tomo-navy">
            {p.nickname.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-extrabold leading-tight text-ink">{p.nickname}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
              <CountryChip country={p.country as "KR" | "JP"} />{p.region}
            </p>
          </div>
        </div>
        <HeartGauge temp={Number(p.trust_temp)} lang={lang} />
        <SellerStats stats={stats} lang={lang} className="mt-3" />
      </div>

      <section aria-label={t(lang, "profile.listings")}>
        <SectionHeader lang={lang} title={t(lang, "profile.listings")} />
        {(listings ?? []).length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3">
            {(listings ?? []).map((l) => {
              const img = (l.images as string[])[0];
              const inactive = l.status !== "active";
              return (
                <li key={l.id}>
                  <Link href={`/listings/${l.id}`} className="press block">
                    <div className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-8 w-12 opacity-60" /></div>
                      )}
                      {inactive && (
                        <span className="absolute inset-0 flex items-center justify-center bg-tomo-navy/75 text-[12px] font-bold text-white">
                          {t(lang, l.status === "sold" ? "badge.sold" : "badge.reserved")}
                        </span>
                      )}
                    </div>
                    <p className={`tnum mt-1 truncate text-[13px] font-extrabold ${inactive ? "text-ink-faint" : "text-ink"}`}>
                      {formatPrice(l.price, l.currency as Currency)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{t(lang, "profile.noListings")}</p>
        )}
      </section>

      <section className="mt-8" aria-label={t(lang, "profile.reviews")}>
        <SectionHeader lang={lang} title={`${t(lang, "profile.reviews")} (${reviews.length})`} />
        {reviews.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {reviews.map((r, i) => (
              <li key={r.id ?? i} className="card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex gap-0.5" aria-label={t(lang, "review.star", { n: r.rating })}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <svg key={n} viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                        <path d={HEART} fill={n <= r.rating ? "#1D4ED8" : "none"} stroke={n <= r.rating ? "#1D4ED8" : "#93A0AB"} strokeWidth={1.8} />
                      </svg>
                    ))}
                  </span>
                  <span className="flex items-center gap-2 truncate text-[11px] text-ink-soft">{r.reviewer?.nickname}{viewer.isAdmin && <AdminDeleteReview reviewId={r.id} lang={lang} />}</span>
                </div>
                {r.comment && <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{r.comment}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{t(lang, "profile.noReviews")}</p>
        )}
      </section>
    </main>
  );
}
