import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { t } from "@/lib/i18n";
import { type MarketSource } from "@/lib/market/types";
import { PageTitle, Tabs, Row, Empty, More } from "@/components/mypage/MyNav";
import { pageLimit, TX_STATUS, PROXY_STATUS } from "@/lib/notifications";
import { redirect } from "next/navigation";

export const metadata = { title: "구매 · 購入 | TOMO", robots: { index: false } };

type MiniListing = { title: string; source_language: string; images: string[]; listing_translations: { language: string; title: string }[] };
type ExtItem = { source: string; title: string; title_translated: string | null; images: string[] };

// 구매 — 직거래 구매(tab=tx, 기본) / 구매대행(tab=proxy). 20건씩 더보기
export default async function MyOrders(props: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/orders");
  const lang = viewer.language;
  const tab = sp.tab === "proxy" ? "proxy" : "tx";
  const { n, limit } = pageLimit(sp.page);
  const more = (has: boolean) => (has ? `/mypage/orders?tab=${tab}&page=${n + 1}` : null);

  let body: React.ReactNode;
  if (tab === "tx") {
    const { data } = await supabase.from("transactions")
      .select("id, status, item_price, currency, listings(title, source_language, images, listing_translations(language, title))")
      .eq("buyer_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
    const list = (data ?? []).slice(0, limit);
    body = (
      <>
        <div className="flex flex-col gap-2">
          {list.map((tx) => {
            const l = tx.listings as unknown as MiniListing | null;
            return (
              <Row key={tx.id} href={`/transactions/${tx.id}`} image={l?.images?.[0]} title={l ? displayTitle(l, lang) : t(lang, "my.item")}
                sub={TX_STATUS[tx.status] ? t(lang, TX_STATUS[tx.status]) : tx.status}
                right={formatPrice(tx.item_price, tx.currency as Currency, lang)} />
            );
          })}
          {list.length === 0 && <Empty text={t(lang, "my.noBuying")} />}
        </div>
        <More lang={lang} href={more((data ?? []).length > limit)} />
      </>
    );
  } else {
    const { data } = await supabase.from("proxy_requests")
      .select("id, status, quote_total, order_id, external_items(source, title, title_translated, images)")
      .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(limit + 1);
    const all = (data ?? []).slice(0, limit);
    // 같은 주문(order_id)의 항목은 한 줄로
    const seen = new Set<string>();
    const list = all.filter((p) => !p.order_id || (!seen.has(p.order_id) && !!seen.add(p.order_id)));
    body = (
      <>
        <div className="flex flex-col gap-2">
          {list.map((p) => {
            const it = p.external_items as unknown as ExtItem | null;
            const cnt = p.order_id ? all.filter((q) => q.order_id === p.order_id).length : 0;
            return (
              <Row key={p.id} href={p.order_id ? `/order/${p.order_id}` : `/proxy/${p.id}`} image={it?.images?.[0]}
                title={it?.title_translated || it?.title || t(lang, "my.item")}
                sub={`${it ? t(lang, `source.${it.source as MarketSource}`) : ""} · ${PROXY_STATUS[p.status] ? t(lang, PROXY_STATUS[p.status]) : p.status}`}
                right={p.order_id ? t(lang, "order.items", { n: cnt }) : p.quote_total ? formatPrice(p.quote_total, "JPY", lang) : t(lang, "proxy.quoteWait")} />
            );
          })}
          {list.length === 0 && <Empty text={t(lang, "my.noProxy")} />}
        </div>
        <More lang={lang} href={more((data ?? []).length > limit)} />
      </>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
      <PageTitle>{t(lang, "my.nav.orders")}</PageTitle>
      <Tabs tabs={[
        { href: "/mypage/orders", label: t(lang, "my.buying"), active: tab === "tx" },
        { href: "/mypage/orders?tab=proxy", label: t(lang, "my.proxy"), active: tab === "proxy" },
      ]} />
      {body}
    </main>
  );
}
