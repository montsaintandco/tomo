import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import ListingCard, { type FeedListing } from "@/components/ListingCard";
import Link from "next/link";
import { redirect } from "next/navigation";

const TABS = [["all","전체"],["local","내 동네"],["global","해외직구"]] as const;

export default async function Home({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");
  const tab = searchParams.tab ?? "all";
  const q = searchParams.q?.trim();

  let query = supabase.from("listings")
    .select("id, title, price, currency, source_language, country, region, status, images, listing_translations(language, title)")
    .order("created_at", { ascending: false }).limit(40);

  if (tab === "local") query = query.eq("country", viewer.country).eq("region", viewer.region).in("trade_method", ["direct", "both"]);
  else if (tab === "global") query = query.neq("country", viewer.country).eq("cross_border_enabled", true);

  if (q) {
    const { data: tIds } = await supabase.from("listing_translations")
      .select("listing_id").ilike("title", `%${q}%`).limit(40);
    const ids = (tIds ?? []).map((t) => t.listing_id);
    query = ids.length > 0
      ? query.or(`title.ilike.%${q}%,id.in.(${ids.join(",")})`)
      : query.ilike("title", `%${q}%`);
  }

  const { data: listings } = await query;

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-tomo-navy">TOMO</h1>
      </div>
      <form className="mb-3">
        <input name="q" defaultValue={q ?? ""} placeholder="검색 · 検索"
          className="w-full rounded-full border px-4 py-2 text-sm" />
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
      </form>
      <div className="mb-4 flex gap-2">
        {TABS.map(([v, l]) => (
          <Link key={v} href={v === "all" ? "/" : `/?tab=${v}`}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === v ? "bg-tomo-navy text-white" : "border bg-white"}`}>
            {l}
          </Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(listings ?? []).map((l) => (
          <ListingCard key={l.id} listing={l as unknown as FeedListing} viewer={viewer} />
        ))}
      </div>
      {(listings ?? []).length === 0 && (
        <p className="mt-16 text-center text-sm text-gray-400">아직 상품이 없어요 · まだ商品がありません</p>
      )}
    </main>
  );
}
