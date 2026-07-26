import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import ListingRow, { type FeedListing } from "@/components/ListingRow";
import Link from "next/link";

const TABS = [["all", "전체"], ["local", "내 동네"], ["global", "해외직구"]] as const;

export default async function Home({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const tab = searchParams.tab ?? "all";
  const q = searchParams.q?.trim();
  const localNeedsLogin = tab === "local" && viewer.guest;

  let query = supabase.from("listings")
    .select("id, title, price, currency, source_language, country, region, status, images, created_at, listing_translations(language, title)")
    .order("created_at", { ascending: false }).limit(40);

  if (tab === "local" && !viewer.guest) query = query.eq("country", viewer.country).eq("region", viewer.region).in("trade_method", ["direct", "both"]);
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

  const { data: listings } = localNeedsLogin ? { data: [] } : await query;

  return (
    <main className="mx-auto max-w-md">
      <header className="sticky top-0 z-20 bg-tomo-ivory/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/" className="font-brand text-2xl text-tomo-navy">TOMO</Link>
          {viewer.guest && (
            <Link href="/login" className="btn bg-tomo-navy px-4 py-1.5 text-sm text-white">로그인</Link>
          )}
        </div>

        <form className="mb-3" role="search">
          <label htmlFor="feed-q" className="sr-only">상품 검색</label>
          <input id="feed-q" name="q" defaultValue={q ?? ""} placeholder="어떤 물건을 찾으세요?"
            className="w-full rounded-full bg-white px-4 py-2.5 text-sm shadow-[0_1px_2px_rgba(12,68,124,0.05)] placeholder:text-gray-400" />
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        </form>

        <div className="flex gap-1.5">
          {TABS.map(([v, l]) => {
            const params = new URLSearchParams();
            if (v !== "all") params.set("tab", v);
            if (q) params.set("q", q);
            const qs = params.toString();
            return (
              <Link key={v} href={qs ? `/?${qs}` : "/"}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                  tab === v ? "bg-tomo-navy text-white" : "bg-white text-gray-500 hover:text-gray-800"}`}>
                {l}
              </Link>
            );
          })}
        </div>
      </header>

      <div className="px-4 pb-6 pt-1">
        {/* 구매 루트 안내 — 자체 상품 외 일본 마켓 대행 진입 */}
        <Link href="/global"
          className="card mb-4 flex items-center gap-3 p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tomo-blue/30 text-lg">✈</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-tomo-navy">일본 마켓 구매대행</span>
            <span className="block text-xs text-gray-500">메루카리·야후 상품을 대신 사서 보내드려요</span>
          </span>
          <span className="shrink-0 text-gray-300">›</span>
        </Link>

        {localNeedsLogin ? (
          <div className="mt-14 flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm leading-relaxed text-gray-500">
              내 동네 상품은 지역을 설정하면 볼 수 있어요<br />
              <span className="text-gray-400">ご近所の商品はログイン後に表示されます</span>
            </p>
            <Link href="/login?next=/?tab=local" className="btn bg-tomo-navy px-6 py-2.5 text-sm text-white">
              로그인하고 동네 설정
            </Link>
          </div>
        ) : (listings ?? []).length > 0 ? (
          <ul className="flex flex-col">
            {(listings ?? []).map((l) => (
              <ListingRow key={l.id} listing={l as unknown as FeedListing} viewer={viewer} />
            ))}
          </ul>
        ) : (
          <div className="mt-14 px-6 text-center">
            <p className="text-sm text-gray-500">
              {q ? `'${q}' 검색 결과가 없어요` : "아직 등록된 상품이 없어요"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {q ? "다른 검색어로 찾아보거나 해외직구를 둘러보세요" : "첫 상품을 등록해 보세요"}
            </p>
            <Link href={q ? "/global" : "/sell"} className="btn mt-4 inline-block bg-tomo-coral px-6 py-2.5 text-sm text-white">
              {q ? "해외직구 둘러보기" : "상품 등록하기"}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
