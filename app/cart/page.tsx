import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import CartList, { type CartRow } from "@/components/CartList";
import type { MarketSource } from "@/lib/market/types";
import type { Currency } from "@/lib/currency";

export const metadata: Metadata = { title: "장바구니 · TOMO" };

function isStale(status: string, fetchedAt: string): boolean {
  return status === "sold" || new Date(fetchedAt).getTime() < Date.now() - 24 * 3600 * 1000;
}

export default async function CartPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/cart");
  const lang = viewer.language;

  const { data } = await supabase.from("cart_items")
    .select("external_item_id, created_at, external_items(source, source_id, title, title_translated, price, currency, images, status, fetched_at)")
    .order("created_at", { ascending: false });
  const rows: CartRow[] = (data ?? []).flatMap((c) => {
    const it = c.external_items as unknown as { source: MarketSource; source_id: string; title: string; title_translated: string | null; price: number; currency: Currency; images: string[]; status: string; fetched_at: string } | null;
    if (!it) return [];
    return [{ id: c.external_item_id, sourceId: it.source_id, title: it.title_translated || it.title, source: it.source, price: it.price, currency: it.currency,
      image: it.images[0] ?? null, stale: isStale(it.status, it.fetched_at) }];
  });

  return (
    <main className="mx-auto max-w-md p-4 pb-64 standalone:pb-72 md:max-w-5xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-3 text-[17px] font-extrabold text-ink md:text-xl">{t(lang, "cart.title")}</h1>
      {rows.length === 0 ? (
        <div className="rounded-card bg-tomo-navy/5 p-8 text-center">
          <p className="text-sm font-bold text-ink-soft">{t(lang, "cart.empty")}</p>
          <Link href="/global" className="btn mt-4 inline-block bg-tomo-navy px-5 py-2.5 text-sm text-white">{t(lang, "cart.emptyCta")}</Link>
        </div>
      ) : (
        <CartList lang={lang} rows={rows} viewerCurrency={viewer.currency} rate={viewer.rate} />
      )}
    </main>
  );
}
