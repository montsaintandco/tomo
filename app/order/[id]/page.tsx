import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t, type I18nKey } from "@/lib/i18n";
import type { Currency } from "@/lib/currency";
import type { MarketSource } from "@/lib/market/types";
import OrderSummary from "@/components/OrderSummary";
import OrderActions from "@/components/OrderActions";

export default async function OrderReceiptPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/order/${id}`);
  const lang = viewer.language;

  const [{ data: o }, { data: reqs }] = await Promise.all([
    supabase.from("proxy_orders").select("*").eq("id", id).maybeSingle(),
    supabase.from("proxy_requests").select("id, status, external_items(source, title, title_translated, images)").eq("order_id", id),
  ]);
  if (!o) notFound();
  const statusKey = `order.status.${o.status}` as I18nKey;

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-1 text-[17px] font-extrabold text-ink md:text-xl">{t(lang, "order.receipt")}</h1>
      <p className={`mb-4 text-[13px] font-bold ${o.status === "paid" ? "text-tomo-navy" : "text-tomo-coral-deep"}`}>{t(lang, statusKey)}</p>

      <div className="mb-4"><OrderSummary lang={lang} totals={{ subtotal: o.subtotal, intlShipping: o.intl_shipping, customs: o.service_fee, total: o.total, currency: o.currency as Currency }} /></div>

      <section className="card mb-4 p-4 text-[13px]">
        <h2 className="mb-1 font-extrabold text-ink">{t(lang, "order.address")}</h2>
        <p className="text-ink">{o.ship_name} · <span className="tnum">{o.ship_phone}</span></p>
        <p className="text-ink-soft">(<span className="tnum">{o.ship_postal}</span>) {o.ship_address}</p>
        {o.ship_note && <p className="mt-1 text-ink-soft">{o.ship_note}</p>}
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "order.itemsTitle")}</h2>
        <ul className="flex flex-col gap-2">
          {(reqs ?? []).map((r) => {
            const it = r.external_items as unknown as { source: MarketSource; title: string; title_translated: string | null; images: string[] } | null;
            return (
              <li key={r.id}>
                <Link href={`/proxy/${r.id}`} className="card flex items-center gap-3 p-3">
                  {it?.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.images[0]} alt="" className="h-11 w-11 rounded-thumb object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13px] text-ink">{it?.title_translated || it?.title}</p>
                    <p className="text-[12px] text-ink-soft">{it ? t(lang, `source.${it.source}`) : ""} · {t(lang, `pstatus.${r.status}` as I18nKey)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {o.status === "pending_payment" && <OrderActions id={o.id} lang={lang} />}
    </main>
  );
}
