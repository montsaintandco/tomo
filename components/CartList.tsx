"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice, convertPrice, type Currency } from "@/lib/currency";
import { proxyOrderTotal } from "@/lib/fees";
import type { MarketSource } from "@/lib/market/types";
import OrderSummary from "@/components/OrderSummary";
import { TomoSymbol } from "@/components/Brand";

export type CartRow = { id: string; sourceId: string; title: string; source: MarketSource; price: number; currency: Currency; image: string | null; stale: boolean };

export default function CartList({ lang, rows, viewerCurrency, rate }: { lang: Lang; rows: CartRow[]; viewerCurrency: Currency; rate: number }) {
  const selectable = rows.filter((r) => !r.stale);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectable.map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const picked = selectable.filter((r) => checked.has(r.id));
  const totals = useMemo(() => proxyOrderTotal(picked, viewerCurrency, rate), [picked, viewerCurrency, rate]);
  const allOn = picked.length === selectable.length && selectable.length > 0;

  async function remove(ids: string[]) {
    setBusy(true);
    const supabase = createBrowserSupabase();
    await supabase.from("cart_items").delete().in("external_item_id", ids);
    const { count } = await supabase.from("cart_items").select("*", { count: "exact", head: true });
    window.dispatchEvent(new CustomEvent("tomo:cart", { detail: count ?? 0 }));
    setBusy(false); router.refresh();
  }
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="flex min-h-11 items-center gap-2 text-[13px] font-bold text-ink">
            <input type="checkbox" className="h-4 w-4 accent-tomo-coral-deep" checked={allOn}
              onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())} />
            {t(lang, "cart.selectAll", { n: picked.length, total: rows.length })}
          </label>
          <button type="button" onClick={() => remove([...checked])} disabled={busy || checked.size === 0}
            className="press rounded-full border-[1.5px] border-tomo-navy/15 px-3 py-1.5 text-[12px] font-bold text-ink-soft disabled:opacity-45">{t(lang, "cart.remove")}</button>
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className={`card flex items-center gap-3 p-3 ${r.stale ? "opacity-70" : ""}`}>
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-tomo-coral-deep" checked={checked.has(r.id)} disabled={r.stale}
                onChange={() => toggle(r.id)} aria-label={r.title} />
              <Link href={`/global/${r.source}/${r.sourceId}`} className="h-14 w-14 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
                {r.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt="" className="h-full w-full object-cover" />
                ) : <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-6 w-9 opacity-60" /></div>}
              </Link>
              <div className="min-w-0 flex-1">
                {r.stale && <p className="mb-0.5 text-[11px] font-bold text-tomo-coral-deep">{t(lang, "cart.changed")}</p>}
                <p className="line-clamp-2 text-[13px] text-ink">{r.title}</p>
                <p className="mt-0.5 text-[12px] text-ink-soft">{t(lang, `source.${r.source}`)} · <span className="tnum font-bold text-ink">
                  {formatPrice(r.currency === viewerCurrency ? r.price : convertPrice(r.price, r.currency, rate), viewerCurrency)}</span></p>
              </div>
              <button type="button" onClick={() => remove([r.id])} disabled={busy} aria-label={t(lang, "cart.removeOne")}
                className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {/* 주문 개요: 모바일 하단 고정, md+ 우측 sticky */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tomo-navy/5 bg-white p-3 standalone:bottom-16 md:static md:border-0 md:bg-transparent md:p-0 md:sticky md:top-24">
        <OrderSummary lang={lang} totals={totals}
          cta={{ label: t(lang, "order.checkout"), href: `/order?items=${picked.map((r) => r.id).join(",")}`, disabled: picked.length === 0 }} />
      </div>
    </div>
  );
}
