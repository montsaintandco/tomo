import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t } from "@/lib/i18n";
import { proxyOrderTotal } from "@/lib/fees";
import OrderForm from "@/components/OrderForm";
import type { CartRow } from "@/components/CartList";
import type { MarketSource } from "@/lib/market/types";
import type { Currency } from "@/lib/currency";
import type { Addr } from "@/components/AddressBook";

export const metadata: Metadata = { title: "주문하기", robots: { index: false } };

// react-hooks/purity: Date.now()는 렌더 바디가 아닌 모듈 스코프 헬퍼로 (app/cart/page.tsx의 isStale과 동일 패턴)
function isFresh(status: string, fetchedAt: string): boolean {
  return status !== "sold" && new Date(fetchedAt).getTime() >= Date.now() - 24 * 3600 * 1000;
}

export default async function OrderPage(props: { searchParams: Promise<{ items?: string }> }) {
  const { items = "" } = await props.searchParams;
  const ids = items.split(",").filter(Boolean);
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/order?items=${items}`)}`);
  if (ids.length === 0) redirect("/cart");
  const lang = viewer.language;

  const [{ data }, addrRes] = await Promise.all([
    supabase.from("cart_items").select("external_item_id, external_items(source, source_id, title, title_translated, price, currency, images, status, fetched_at)").in("external_item_id", ids),
    supabase.from("addresses").select("id, label, name, phone, postal, address, note, pccc, is_default")
      .eq("user_id", viewer.id).order("is_default", { ascending: false }).order("created_at", { ascending: true }),
  ]);
  // 주소록(0028)이 없으면 기존대로 profiles.ship_* 프리필. 있으면 기본 배송지(0028은 profiles.ship_* 공개 조회를 막는다)
  const addresses = addrRes.error ? null : ((addrRes.data ?? []) as Addr[]);
  const def = addresses?.[0];
  const prof = addresses ? null
    : (await supabase.from("profiles").select("ship_name, ship_phone, ship_postal, ship_address, ship_note").eq("id", viewer.id).single()).data;
  const rows: CartRow[] = (data ?? []).flatMap((c) => {
    const it = c.external_items as unknown as { source: MarketSource; source_id: string; title: string; title_translated: string | null; price: number; currency: Currency; images: string[]; status: string; fetched_at: string } | null;
    if (!it || !isFresh(it.status, it.fetched_at)) return [];
    return [{ id: c.external_item_id, sourceId: it.source_id, title: it.title_translated || it.title, source: it.source, price: it.price, currency: it.currency, image: it.images[0] ?? null, stale: false }];
  });
  if (rows.length === 0) redirect("/cart");
  const totals = proxyOrderTotal(rows, viewer.currency, viewer.rate);

  return (
    <main className="mx-auto max-w-md p-4 pb-64 standalone:pb-72 md:max-w-5xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-3 text-[17px] font-extrabold text-ink md:text-xl">{t(lang, "order.title")}</h1>
      <OrderForm lang={lang} rows={rows} totals={totals} rate={viewer.rate}
        addresses={addresses} needPccc={!!addresses && viewer.country === "KR"}
        initialShip={def
          ? { name: def.name, phone: def.phone, postal: def.postal, address: def.address, note: def.note }
          : { name: prof?.ship_name ?? "", phone: prof?.ship_phone ?? "", postal: prof?.ship_postal ?? "", address: prof?.ship_address ?? "", note: prof?.ship_note ?? "" }} />
    </main>
  );
}
