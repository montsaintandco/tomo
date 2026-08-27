import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import HeartGauge from "@/components/HeartGauge";
import { CountryChip } from "@/components/Brand";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type Review = {
  rating: number; comment: string; created_at: string;
  reviewer: { nickname: string } | null;
};

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  if (params.id === "me" && (viewer.guest || !viewer.id)) redirect("/login?next=/profile/me");
  const targetId = params.id === "me" ? viewer.id! : params.id;

  const { data: p } = await supabase.from("profiles")
    .select("id, nickname, country, region, trust_temp").eq("id", targetId).maybeSingle();
  if (!p) notFound();

  const { data: listings } = await supabase.from("listings")
    .select("id, title, price, currency, status, images")
    .eq("seller_id", targetId).order("created_at", { ascending: false }).limit(20);

  // 받은 후기 = 이 거래의 상대가 남긴 후기 (reviewer가 본인이 아닌 것)
  const { data: reviewsRaw } = await supabase.from("reviews")
    .select(`rating, comment, created_at,
      reviewer:profiles!reviews_reviewer_id_fkey(nickname),
      transactions!inner(buyer_id, seller_id)`)
    .neq("reviewer_id", targetId)
    .or(`buyer_id.eq.${targetId},seller_id.eq.${targetId}`, { referencedTable: "transactions" })
    .order("created_at", { ascending: false }).limit(20);
  const reviews = (reviewsRaw ?? []) as unknown as Review[];

  return (
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <div className="card mb-4 p-4 md:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">{p.nickname}</p>
            <p className="flex items-center gap-1.5 text-xs text-ink-soft">
              <CountryChip country={p.country as "KR" | "JP"} />{p.region}
            </p>
          </div>
        </div>
        <HeartGauge temp={Number(p.trust_temp)} />
      </div>

      <h2 className="mb-2 text-sm font-bold text-ink-soft">판매 상품 · 出品</h2>
      <div className="mb-5 grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3">
        {(listings ?? []).map((l) => (
          <Link key={l.id} href={`/listings/${l.id}`} className="block">
            <div className="relative aspect-square overflow-hidden rounded-card bg-tomo-navy/5">
              {(l.images as string[])[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(l.images as string[])[0]} alt="" className="h-full w-full object-cover" />
              )}
              {l.status !== "active" && (
                <span className="absolute inset-0 flex items-center justify-center bg-tomo-navy/60 text-xs font-bold text-white">
                  {l.status === "sold" ? "판매완료" : "예약중"}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-[11px] font-bold text-tomo-navy">
              {formatPrice(l.price, l.currency as Currency)}
            </p>
          </Link>
        ))}
        {(listings ?? []).length === 0 && (
          <p className="col-span-3 rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft md:col-span-4">
            등록한 상품이 없어요
          </p>
        )}
      </div>

      <h2 className="mb-2 text-sm font-bold text-ink-soft">받은 후기 · レビュー ({reviews.length})</h2>
      <div className="flex flex-col gap-2">
        {reviews.map((r, i) => (
          <div key={i} className="card p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-tomo-coral">{"♥".repeat(r.rating)}</span>
              <span className="text-[10px] text-ink-faint">{r.reviewer?.nickname}</span>
            </div>
            {r.comment && <p className="mt-1 text-xs text-ink-soft">{r.comment}</p>}
          </div>
        ))}
        {reviews.length === 0 && (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">
            아직 후기가 없어요
          </p>
        )}
      </div>
    </main>
  );
}
