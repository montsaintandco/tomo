import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import { PageTitle, Tabs, Row, Empty } from "@/components/mypage/MyNav";
import { auctionEnabled, timeLeftShort, type AuctionStatus, type Cur } from "@/lib/auction";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

// 플래그가 꺼지면 제목도 남기지 않는다(본문은 404)
export const metadata = { ...(auctionEnabled() ? { title: "경매 · オークション" } : {}), robots: { index: false } };

// 마이페이지 경매(U4) — 입찰 중(1등/밀림) · 낙찰(결제 필요 강조) · 내 경매(판매). 상세가 입찰·결제·다시 경매 화면이다.
type MyBid = {
  id: string; listing_id: string; status: AuctionStatus; currency: Cur; current_price: number; bid_count: number;
  ends_at: string; pay_due_at: string | null; final_price: number | null; my_max: number; leading: boolean; won: boolean;
  title: string; image: string | null;
};
type MySale = {
  id: string; listing_id: string; status: AuctionStatus; currency: Cur; current_price: number; bid_count: number;
  ends_at: string; pay_due_at: string | null; final_price: number | null;
  listings: { title: string; images: string[]; sale_type: string } | null;
};
const TABS = ["bidding", "won", "selling"] as const;
const leftOf = (iso: string) => new Date(iso).getTime() - Date.now();

export default async function MyAuctions(props: { searchParams: Promise<{ tab?: string }> }) {
  if (!auctionEnabled()) notFound();
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/auctions");
  const lang: Lang = viewer.language;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "bidding";
  const f = (n: number, c: Cur) => formatPrice(n, c, lang);

  let body: React.ReactNode;
  if (tab === "selling") {
    const { data } = await supabase.from("auctions")
      .select("id, listing_id, status, currency, current_price, bid_count, ends_at, pay_due_at, final_price, listings(title, images, sale_type)")
      .eq("seller_id", viewer.id).order("created_at", { ascending: false }).limit(100);
    // 같은 상품을 다시 경매했으면 가장 최근 경매만
    const seen = new Set<string>();
    const list = ((data ?? []) as unknown as MySale[]).filter((a) => !seen.has(a.listing_id) && !!seen.add(a.listing_id));
    body = list.length ? (
      <div className="flex flex-col gap-2">
        {list.map((a) => {
          const choice = a.listings?.sale_type === "auction" && (a.status === "unsold" || a.status === "unpaid");
          const sub = [
            t(lang, `auction.st.${a.status}`), t(lang, "auction.bids", { n: a.bid_count }),
            ...(a.status === "live" ? [timeLeftShort(lang, leftOf(a.ends_at))] : []),
            ...(choice ? [t(lang, "auction.my.needChoice")] : []),
          ].join(" · ");
          return <Row key={a.id} href={`/listings/${a.listing_id}`} image={a.listings?.images?.[0]} title={a.listings?.title ?? ""}
            sub={sub} right={f(a.final_price ?? a.current_price, a.currency)} />;
        })}
      </div>
    ) : <Empty text={t(lang, "auction.my.noSelling")} />;
  } else {
    const { data } = await supabase.rpc("my_auction_bids", { p_limit: 100 });
    const all = (Array.isArray(data) ? data : []) as MyBid[];
    const list = tab === "won" ? all.filter((a) => a.won) : all.filter((a) => a.status === "live");
    body = list.length ? (
      <div className="flex flex-col gap-2">
        {list.map((a) => {
          const payNeeded = a.won && a.status === "awaiting_payment" && !!a.pay_due_at && leftOf(a.pay_due_at) > 0;
          const sub = tab === "won"
            ? payNeeded ? t(lang, "auction.my.payNeeded", { left: timeLeftShort(lang, leftOf(a.pay_due_at!)) })
              : t(lang, a.status === "paid" ? "auction.my.paid" : a.status === "unpaid" || a.status === "awaiting_payment" ? "auction.my.expired" : `auction.st.${a.status}`)
            : `${t(lang, a.leading ? "auction.my.leading" : "auction.my.outbid")} · ${t(lang, "auction.maxLabel")} ${f(a.my_max, a.currency)} · ${timeLeftShort(lang, leftOf(a.ends_at))}`;
          return (
            <div key={a.id} className={payNeeded ? "rounded-card ring-2 ring-tomo-rose/40" : ""}>
              <Row href={`/listings/${a.listing_id}`} image={a.image ?? undefined} title={a.title} sub={sub}
                right={f(a.final_price ?? a.current_price, a.currency)}
                extra={payNeeded ? (
                  <Link href={`/listings/${a.listing_id}`} className="btn shrink-0 bg-tomo-coral-deep px-3 py-2 text-[12px] text-white">{t(lang, "act.pay")}</Link>
                ) : undefined} />
            </div>
          );
        })}
      </div>
    ) : <Empty text={t(lang, tab === "won" ? "auction.my.noWon" : "auction.my.noBidding")} />;
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <PageTitle>{t(lang, "auction.my.title")}</PageTitle>
      <Tabs tabs={TABS.map((k) => ({ href: k === "bidding" ? "/mypage/auctions" : `/mypage/auctions?tab=${k}`, label: t(lang, `auction.my.${k}`), active: tab === k }))} />
      {body}
    </main>
  );
}
