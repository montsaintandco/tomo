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
    const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const [tRes, oRes] = await Promise.all([
      supabase.from("listing_translations").select("listing_id").ilike("title", pattern).limit(60),
      supabase.from("listings").select("id").ilike("title", pattern).limit(60),
    ]);
    const ids = Array.from(new Set([
      ...(tRes.data ?? []).map((t) => t.listing_id),
      ...(oRes.data ?? []).map((o) => o.id),
    ]));
    query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
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
        {TABS.map(([v, l]) => {
          const params = new URLSearchParams();
          if (v !== "all") params.set("tab", v);
          if (q) params.set("q", q);
          const qs = params.toString();
          return (
            <Link key={v} href={qs ? `/?${qs}` : "/"}
              className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === v ? "bg-tomo-navy text-white" : "border bg-white"}`}>
              {l}
            </Link>
          );
        })}
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
