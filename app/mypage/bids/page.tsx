import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice } from "@/lib/currency";
import { fmtAt } from "@/lib/datetime";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { PageTitle, Tabs, Row, Empty } from "@/components/mypage/MyNav";
import { marketBidEnabled } from "@/lib/market-bid";
import { notFound, redirect } from "next/navigation";

export const metadata = { ...(marketBidEnabled() ? { title: "입찰 신청 · 入札申込" } : {}), robots: { index: false } };

// 마이페이지 「입찰 신청」(M4): 해외 마켓 경매 입찰 대행 신청 목록. 진행 중 · 끝난 신청. 줄을 누르면 신청 상세(/bids/[id]), 낙찰 건은 거기서 주문으로
type B = { id: string; code: string; status: string; cap_jpy: number; auth_krw: number; captured_krw: number | null; ends_at: string;
  item: { title: string; title_translated: string | null; images: string[] | null } | null };
const OPEN = ["pending_auth", "authorized", "placed", "outbid", "hold", "won", "capture_failed"];

export default async function MyBids(props: { searchParams: Promise<{ tab?: string }> }) {
  if (!marketBidEnabled()) notFound();
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/bids");
  const lang: Lang = viewer.language;
  const done = sp.tab === "done";
  let q = supabase.from("market_bids")
    .select("id, code, status, cap_jpy, auth_krw, captured_krw, ends_at, item:external_items!market_bids_external_item_id_fkey(title, title_translated, images)")
    .eq("user_id", viewer.id).neq("status", "expired").order("created_at", { ascending: false }).limit(100);
  q = done ? q.not("status", "in", `(${OPEN.join(",")})`) : q.in("status", OPEN);
  const { data } = await q;
  const list = (data ?? []) as unknown as B[];
  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <PageTitle>{t(lang, "mb.my.title")}</PageTitle>
      <Tabs tabs={[{ href: "/mypage/bids", label: t(lang, "mb.my.open"), active: !done }, { href: "/mypage/bids?tab=done", label: t(lang, "mb.my.done"), active: done }]} />
      {list.length ? (
        <div className="flex flex-col gap-2">
          {list.map((b) => (
            <Row key={b.id} href={`/bids/${b.id}`} image={b.item?.images?.[0] ?? undefined}
              title={(lang === "ko" ? b.item?.title_translated : null) || b.item?.title || b.code}
              sub={`${b.code} · ${t(lang, `mb.st.${b.status}` as I18nKey)} · ${t(lang, "mb.panel.ends")} ${fmtAt(b.ends_at, lang)}`}
              right={b.captured_krw != null ? formatPrice(b.captured_krw, "KRW", lang) : formatPrice(b.cap_jpy, "JPY", lang)} />
          ))}
        </div>
      ) : <Empty text={t(lang, "mb.my.empty")} />}
    </main>
  );
}
