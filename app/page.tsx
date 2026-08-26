import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import ListingRow, { type FeedListing } from "@/components/ListingRow";
import { Wordmark, TomoSymbol } from "@/components/Brand";
import Link from "next/link";

// 구매 루트: 전체 / 내 동네 직거래 / 상대국 여행 중 직거래 (해외 대행구매는 /global)
const TABS = [["all", "전체"], ["local", "내 동네"], ["travel", "여행 직거래"]] as const;

export default async function Home({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const tab = searchParams.tab ?? "all";
  const q = searchParams.q?.trim();
  const localNeedsLogin = tab === "local" && viewer.guest;

  // 판매중 → 예약중 → 거래완료 순으로 노출 (당근·메루카리 관행: 끝난 거래는 뒤로)
  let query = supabase.from("listings")
    .select("id, title, price, currency, source_language, country, region, status, images, created_at, trade_method, cross_border_enabled, listing_translations(language, title)")
    .order("status", { ascending: true })   // active < reserved < sold (enum 정의 순)
    .order("created_at", { ascending: false })
    .limit(40);

  if (tab === "local" && !viewer.guest) {
    query = query.eq("country", viewer.country).eq("region", viewer.region).in("trade_method", ["direct", "both"]);
  } else if (tab === "travel") {
    // 상대국에서 직접 만나 거래할 수 있는 상품 (여행 갔을 때). 게스트는 KR 기준으로 일본 상품
    query = query.neq("country", viewer.country).in("trade_method", ["direct", "both"]);
  }

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
      <header className="sticky top-0 z-20 bg-tomo-ivory/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/" className="press"><Wordmark /></Link>
          {viewer.guest && (
            <Link href="/login" className="btn bg-tomo-navy px-4 py-1.5 text-sm text-white">로그인</Link>
          )}
        </div>

        <form className="mb-3" role="search">
          <label htmlFor="feed-q" className="sr-only">상품 검색</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden>
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
            </svg>
            <input id="feed-q" name="q" defaultValue={q ?? ""} placeholder="어떤 물건을 찾으세요?"
              className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-sm shadow-[var(--shadow-soft)] placeholder:text-ink-soft" />
          </div>
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        </form>

        <div className="flex gap-1.5" role="tablist" aria-label="구매 루트">
          {TABS.map(([v, l]) => {
            const params = new URLSearchParams();
            if (v !== "all") params.set("tab", v);
            if (q) params.set("q", q);
            const qs = params.toString();
            return (
              <Link key={v} href={qs ? `/?${qs}` : "/"} aria-current={tab === v ? "page" : undefined}
                className={`press rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                  tab === v ? "bg-tomo-navy text-white shadow-[var(--shadow-soft)]" : "bg-white text-ink-soft hover:text-ink"}`}>
                {l}
              </Link>
            );
          })}
        </div>
      </header>

      <div className="px-4 pb-6 pt-1">
        {/* 구매 루트 안내 — 두 나라를 잇는 순간이므로 그라데이션 필드 */}
        <Link href="/global"
          className="grad-bridge press mb-4 flex items-center gap-3 rounded-card p-3.5 shadow-[var(--shadow-soft)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/85">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M10.5 13.5 3.5 11l1.8-1.8 5.5.9 4.8-4.8a1.6 1.6 0 0 1 2.3 2.3l-4.8 4.8.9 5.5-1.8 1.8z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-tomo-navy">일본 마켓 구매대행</span>
            <span className="block text-xs text-tomo-navy/90">메루카리·야후 상품을 대신 사서 보내드려요</span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 opacity-60" aria-hidden>
            <path d="m9 5 7 7-7 7" />
          </svg>
        </Link>

        {localNeedsLogin ? (
          <div className="mt-12 flex flex-col items-center gap-3 px-6 text-center">
            <TomoSymbol />
            <p className="text-sm leading-relaxed text-ink-soft">
              내 동네 상품은 지역을 설정하면 볼 수 있어요<br />
              <span className="text-ink-soft">ご近所の商品はログイン後に表示されます</span>
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
          <div className="mt-12 flex flex-col items-center px-6 text-center">
            <TomoSymbol />
            <p className="mt-3 text-sm text-ink-soft">
              {q ? `'${q}' 검색 결과가 없어요`
                : tab === "travel" ? "여행 중 직거래할 상품이 아직 없어요"
                : "아직 등록된 상품이 없어요"}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {q ? "다른 검색어로 찾아보거나 해외직구를 둘러보세요"
                : tab === "travel" ? "상대 나라에서 직접 만나 거래할 수 있는 상품이 여기 모여요"
                : "첫 상품을 등록해 보세요"}
            </p>
            <Link href={q || tab === "travel" ? "/global" : "/sell"}
              className="btn mt-4 inline-block bg-tomo-coral-deep px-6 py-2.5 text-sm text-white">
              {q || tab === "travel" ? "해외직구 둘러보기" : "상품 등록하기"}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
