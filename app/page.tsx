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

  const { data: listings, error: feedError } = localNeedsLogin
    ? { data: [], error: null }
    : await query;

  return (
    <main className="mx-auto max-w-md md:max-w-6xl md:px-6">
      <header className="sticky top-0 z-20 bg-tomo-ivory/95 px-4 pb-3 pt-3 backdrop-blur md:static md:bg-transparent md:px-0 md:pb-4 md:pt-8 md:backdrop-blur-0">
        <div className="mb-3 flex items-center justify-between md:mb-4">
          <Link href="/" className="press md:hidden"><Wordmark /></Link>
          <h1 className="font-brand hidden text-2xl text-tomo-navy md:block">오늘의 중고거래</h1>
          {viewer.guest && (
            <Link href="/login" className="btn bg-tomo-navy px-4 py-1.5 text-sm text-white">로그인</Link>
          )}
        </div>

        <form className="mb-3 md:max-w-xl" role="search">
          <label htmlFor="feed-q" className="sr-only">상품 검색</label>
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint md:left-4 md:h-[18px] md:w-[18px]" aria-hidden>
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
            </svg>
            <input id="feed-q" name="q" defaultValue={q ?? ""} placeholder="어떤 물건을 찾으세요?"
              className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-sm shadow-[var(--shadow-soft)] placeholder:text-ink-soft md:py-3.5 md:pl-12 md:text-[15px]" />
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
                className={`press rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors md:px-5 md:py-2 md:text-sm ${
                  tab === v ? "bg-tomo-navy text-white shadow-[var(--shadow-soft)]" : "bg-white text-ink-soft hover:text-ink"}`}>
                {l}
              </Link>
            );
          })}
        </div>
      </header>

      <div className="px-4 pb-6 pt-1 md:px-0 md:pb-16">
        {/* 구매 루트 안내 — 두 나라를 잇는 순간이므로 그라데이션 필드.
            데스크톱은 말풍선 꼬리 실루엣을 히어로 스케일로 키운다 */}
        <Link href="/global"
          className="grad-bridge press mb-4 flex items-center gap-3 rounded-card p-3.5 shadow-[var(--shadow-soft)] md:mb-9 md:gap-8 md:rounded-[32px] md:rounded-bl-[10px] md:p-10">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/85 md:hidden">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M10.5 13.5 3.5 11l1.8-1.8 5.5.9 4.8-4.8a1.6 1.6 0 0 1 2.3 2.3l-4.8 4.8.9 5.5-1.8 1.8z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-brand block text-sm text-tomo-navy md:text-[34px] md:leading-tight">일본 마켓 구매대행</span>
            <span className="mt-0.5 block text-xs text-tomo-navy/90 md:mt-3 md:text-base">
              메루카리·야후 상품을 대신 사서 보내드려요
              <span className="hidden md:inline"> — 견적 확인 후 결제, 센터 검수를 거쳐 도착까지.</span>
            </span>
            <span className="btn mt-5 hidden w-fit items-center gap-2 bg-white/90 px-6 py-2.5 text-sm text-tomo-navy shadow-[var(--shadow-soft)] md:inline-flex">
              해외직구 둘러보기
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
                strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="m9 5 7 7-7 7" />
              </svg>
            </span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 opacity-60 md:hidden" aria-hidden>
            <path d="m9 5 7 7-7 7" />
          </svg>
          <TomoSymbol className="hidden h-32 w-48 shrink-0 md:block" />
        </Link>

        {/* 피드 섹션 헤딩 — 히어로 다음 스크롤 리듬 (데스크톱 전용) */}
        {!feedError && !localNeedsLogin && (listings ?? []).length > 0 && (
          <div className="mb-5 hidden items-baseline justify-between md:flex">
            <h2 className="text-lg font-bold text-ink">
              {q ? `'${q}' 검색 결과` : tab === "local" ? "내 동네 물건" : tab === "travel" ? "여행 중 직거래" : "지금 올라온 물건"}
            </h2>
            <p className="text-xs text-ink-soft">색이 나라를 말해요 — 블루는 한국, 핑크는 일본</p>
          </div>
        )}

        {feedError ? (
          <div role="alert" className="mt-12 flex flex-col items-center px-6 text-center">
            <TomoSymbol />
            <p className="mt-3 text-sm font-bold text-ink">
              상품을 불러오지 못했어요 · 商品を読み込めませんでした
            </p>
            <p className="mt-1 text-xs text-ink-soft">잠시 후 다시 시도해 주세요</p>
            <Link href={`/?${new URLSearchParams({ ...(tab !== "all" && { tab }), ...(q && { q }) })}`}
              className="btn mt-4 inline-block bg-tomo-navy px-6 py-2.5 text-sm text-white">
              다시 시도
            </Link>
          </div>
        ) : localNeedsLogin ? (
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
          <ul className="flex flex-col md:grid md:grid-cols-3 md:gap-x-5 md:gap-y-8 lg:grid-cols-4">
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
