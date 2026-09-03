import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice, convertPrice, type Currency } from "@/lib/currency";
import { type MarketSource } from "@/lib/market/types";
import { t, type Lang } from "@/lib/i18n";
import ProxyActions from "@/components/ProxyActions";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

const STEPS = ["requested", "quoted", "approved", "paid", "purchasing", "center_received",
  "shipped_international", "delivered", "completed"] as const;

type Row = {
  id: string; status: string; note: string; center: string | null; intl_tracking: string | null;
  quote_item_price: number | null; quote_fee: number | null;
  quote_shipping: number | null; quote_total: number | null;
  user_id: string;
  external_items: {
    source: string; source_id: string; title: string; title_translated: string | null;
    price: number; currency: Currency; images: string[]; url: string;
  } | null;
};

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex justify-between gap-3 first:mt-0">
      <span className="text-ink-soft">{label}</span>
      <span className="tnum text-ink">{value}</span>
    </div>
  );
}

export default async function ProxyDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/proxy/${params.id}`);
  const lang: Lang = viewer.language;

  const { data } = await supabase.from("proxy_requests")
    .select(`id, status, note, center, intl_tracking, user_id,
      quote_item_price, quote_fee, quote_shipping, quote_total,
      external_items(source, source_id, title, title_translated, price, currency, images, url)`)
    .eq("id", params.id).maybeSingle();
  if (!data) notFound(); // RLS: 본인/어드민만

  const r = data as unknown as Row;
  const item = r.external_items;
  const isOwner = r.user_id === viewer.id;
  const cur = Math.max(0, STEPS.findIndex((s) => s === r.status));
  const cancelled = r.status === "cancelled";
  const totalBuyer = r.quote_total != null && viewer.currency === "KRW"
    ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(r.quote_total, "JPY", viewer.rate), "KRW")}`
    : r.quote_total != null ? formatPrice(r.quote_total, "JPY") : "";

  return (
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-3 text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "proxy.title")}</h1>

      {item && (
        <Link href={`/global/${item.source}/${item.source_id}`} className="card mb-4 flex items-center gap-3 p-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
            {item.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.images[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-6 w-9 opacity-60" /></div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm text-ink">{item.title_translated || item.title}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {t(lang, `source.${item.source as MarketSource}`)} · <span className="tnum font-bold text-ink">{formatPrice(item.price, item.currency)}</span>
            </p>
          </div>
        </Link>
      )}

      <div className="card mb-4 p-4">
        {cancelled ? (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-sm font-bold text-ink-soft">{t(lang, "proxy.cancelled")}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {STEPS.map((s, i) => {
              const done = i < cur, active = i === cur;
              return (
                <li key={s} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    done ? "bg-tomo-navy text-white" : active ? "bg-tomo-coral-deep text-white" : "bg-tomo-navy/10 text-ink-soft"}`}>
                    {done ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}
                        strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden><path d="m6 12.5 4 4 8-9" /></svg>
                    ) : i + 1}
                  </span>
                  <span className={`text-sm ${active ? "font-bold text-ink" : done ? "text-ink-soft" : "text-ink-faint"}`}>
                    {t(lang, `pstatus.${s}`)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {r.quote_total != null ? (
        <div className="card mb-4 p-4 text-[13px]">
          <p className="mb-2 font-bold text-tomo-navy">{t(lang, "proxy.quote")}</p>
          <Line label={t(lang, "ext.item")} value={formatPrice(r.quote_item_price ?? 0, "JPY")} />
          <Line label={t(lang, "ext.fee")} value={formatPrice(r.quote_fee ?? 0, "JPY")} />
          <Line label={t(lang, "tx.intlShipping")} value={formatPrice(r.quote_shipping ?? 0, "JPY")} />
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
            <span className="font-bold text-ink">{t(lang, "ext.total")}</span>
            <span className="text-right">
              <span className="tnum block text-[15px] font-extrabold text-tomo-navy">{totalBuyer}</span>
              {viewer.currency === "KRW" && <span className="tnum block text-[11px] font-bold text-ink-soft">{formatPrice(r.quote_total, "JPY")}</span>}
            </span>
          </div>
        </div>
      ) : !cancelled && (
        <p className="mb-4 rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{t(lang, "proxy.quotePending")}</p>
      )}

      {r.intl_tracking && (
        <dl className="card mb-4 grid grid-cols-[auto_1fr] gap-x-3 p-3 text-xs text-ink-soft">
          <dt className="font-bold text-ink">{t(lang, "tx.intlTracking")}</dt><dd className="tnum">{r.intl_tracking}</dd>
        </dl>
      )}

      <ProxyActions id={r.id} status={r.status} isOwner={isOwner} isAdmin={viewer.isAdmin} lang={lang} />
    </main>
  );
}
