import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice } from "@/lib/currency";
import { fmtAt } from "@/lib/datetime";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { marketBidEnabled, type MarketBidStatus } from "@/lib/market-bid";
import { BidCancel, BidRefresh } from "@/components/market-bid/BidLive";

export const metadata = { robots: { index: false }, ...(marketBidEnabled() ? { title: "입찰 신청 · 入札申込" } : {}) };

// 입찰 신청 상세(M4, docs/aaa/15 6.1절). 결제 복귀(?mb=ok|fail&code=)도 여기. 본인만(RLS). 플래그가 꺼지면 404.
type Bid = {
  id: string; code: string; status: MarketBidStatus; source: string; source_id: string; cap_jpy: number; auth_krw: number; last_bid_jpy: number | null;
  is_top: boolean | null; ends_at: string; final_price_jpy: number | null; captured_krw: number | null; order_id: string | null; created_at: string;
  item: { title: string; title_translated: string | null; images: string[] | null } | null;
};
const LIVE: MarketBidStatus[] = ["pending_auth", "authorized", "placed", "outbid", "hold", "won"];

export default async function BidPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ mb?: string; code?: string }> }) {
  if (!marketBidEnabled()) notFound();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/bids/${id}`);
  const lang: Lang = viewer.language;
  const { data } = await supabase.from("market_bids")
    .select("id, code, status, source, source_id, cap_jpy, auth_krw, last_bid_jpy, is_top, ends_at, final_price_jpy, captured_krw, order_id, created_at, item:external_items!market_bids_external_item_id_fkey(title, title_translated, images)")
    .eq("id", id).maybeSingle();
  const b = data as unknown as Bid | null;
  if (!b) notFound();
  const [ev, order] = await Promise.all([
    supabase.rpc("my_market_bid_events", { p_id: id }),
    b.order_id ? supabase.from("proxy_orders").select("id, code").eq("id", b.order_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const events = (Array.isArray(ev.data) ? ev.data : []) as { kind: string; amount_jpy: number | null; at: string }[];
  const o = order.data as { id: string; code: string } | null;
  const title = (lang === "ko" ? b.item?.title_translated : null) || b.item?.title || b.code;
  const jpy = (n: number) => formatPrice(n, "JPY", lang);
  const krw = (n: number) => formatPrice(n, "KRW", lang);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-tomo-navy/5 py-2 last:border-b-0">
      <dt className="text-[12px] text-ink-soft">{k}</dt><dd className="tnum text-right text-[13px] font-bold">{v}</dd>
    </div>
  );
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-4 pb-10">
      {LIVE.includes(b.status) && <BidRefresh />}
      {sp.mb === "ok" && <p role="status" className="rounded-card bg-tomo-navy/5 p-3 text-[13px]">{t(lang, "mb.d.payOk")}</p>}
      {sp.mb === "fail" && <p role="alert" className="rounded-card bg-tomo-rose/10 p-3 text-[13px] text-tomo-rose">{t(lang, "mb.d.payFail", { code: (sp.code ?? "").slice(0, 40) })}</p>}
      <section className="card p-4">
        <p className="text-[12px] text-ink-soft">{t(lang, "mb.my.title")} {b.code}</p>
        <h1 className="mt-1 text-[16px] font-extrabold text-ink">{title}</h1>
        <p className="mt-2 inline-block rounded-full bg-tomo-navy px-3 py-1 text-[12px] font-bold text-white">{t(lang, `mb.st.${b.status}` as I18nKey)}</p>
        <dl className="mt-3">
          {row(t(lang, "mb.d.cap"), jpy(b.cap_jpy))}
          {row(t(lang, "mb.d.max"), krw(b.auth_krw))}
          {b.last_bid_jpy != null && row(t(lang, "mb.d.lastBid"), jpy(b.last_bid_jpy))}
          {row(t(lang, "mb.panel.ends"), fmtAt(b.ends_at, lang))}
          {b.final_price_jpy != null && (b.status === "ordered" || b.status === "won") && row(t(lang, "mb.d.final"), jpy(b.final_price_jpy))}
          {b.captured_krw != null && row(t(lang, "mb.d.charged"), krw(b.captured_krw))}
        </dl>
        <div className="mt-3 flex flex-col gap-2">
          {o && <Link href={`/order/${o.id}`} className="btn block bg-tomo-coral-deep py-3 text-center text-sm text-white">{t(lang, "mb.d.order", { code: o.code })}</Link>}
          <Link href={`/global/${b.source}/${b.source_id}`} className="btn block border border-tomo-navy/15 bg-white py-2.5 text-center text-[13px] text-ink">{t(lang, "mb.d.item")}</Link>
          {(b.status === "pending_auth" || b.status === "authorized") && <BidCancel lang={lang} bidId={b.id} />}
        </div>
        <p className="mt-3 text-[11px] text-ink-soft">{t(lang, "mb.panel.rule")}</p>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 text-[14px] font-extrabold">{t(lang, "mb.d.history")}</h2>
        <ol className="flex flex-col gap-1.5 text-[12px]">
          {events.map((e, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>{t(lang, `mb.ev.${e.kind}` as I18nKey)}{e.amount_jpy != null && e.kind !== "requested" ? ` · ${jpy(e.amount_jpy)}` : ""}</span>
              <span className="tnum text-ink-soft">{fmtAt(e.at, lang)}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
