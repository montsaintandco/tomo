import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import HeartGauge from "@/components/HeartGauge";
import SectionHeader from "@/components/SectionHeader";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import LogoutButton from "@/components/LogoutButton";
import { type MarketSource } from "@/lib/market/types";
import Link from "next/link";
import { redirect } from "next/navigation";

const TX_STATUS: Record<string, I18nKey> = {
  pending_payment: "status.pending_payment", paid: "status.paid", shipped: "status.shipped",
  shipped_to_center: "status.shipped_to_center", center_received: "status.center_received",
  shipped_international: "status.shipped_international", delivered: "status.delivered",
  completed: "status.completed", cancelled: "status.cancelled", disputed: "status.disputed",
};
const PROXY_STATUS: Record<string, I18nKey> = {
  requested: "pstatus.requested", quoted: "pstatus.quoted", approved: "pstatus.approved",
  paid: "pstatus.paid", purchasing: "pstatus.purchasing", center_received: "pstatus.center_received",
  shipped_international: "pstatus.shipped_international", delivered: "pstatus.delivered",
  completed: "pstatus.completed", cancelled: "pstatus.cancelled",
};

export default async function MyPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage");
  const lang: Lang = viewer.language;

  const [{ data: profile }, { data: buying }, { data: selling }, { data: proxies }, { data: wishes }] = await Promise.all([
    supabase.from("profiles").select("nickname, country, region, trust_temp").eq("id", viewer.id).single(),
    supabase.from("transactions")
      .select("id, status, item_price, currency, listings(title, source_language, images, listing_translations(language, title))")
      .eq("buyer_id", viewer.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("listings")
      .select("id, title, price, currency, status, images")
      .eq("seller_id", viewer.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("proxy_requests")
      .select("id, status, quote_total, external_items(source, title, title_translated, images)")
      .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("wishlists")
      .select("listing_id, price_at_wish, listings(id, title, price, currency, status, images, source_language, listing_translations(language, title))")
      .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(10),
  ]);

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <div className="card mb-6 p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tomo-navy/5 text-[17px] font-extrabold text-tomo-navy">
              {profile?.nickname?.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-extrabold leading-tight text-ink">{profile?.nickname}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-soft">
                <CountryChip country={(profile?.country ?? "KR") as "KR" | "JP"} />
                {profile?.region}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {viewer.isAdmin && (
              <Link href="/admin" className="btn bg-tomo-navy px-3 py-2 text-xs text-white">{t(lang, "my.admin")}</Link>
            )}
            <LogoutButton lang={lang} />
          </div>
        </div>
        <HeartGauge temp={Number(profile?.trust_temp ?? 36.5)} lang={lang} />
      </div>

      <section aria-label={t(lang, "my.proxy")}>
        <SectionHeader lang={lang} title={t(lang, "my.proxy")} href="/global" linkLabel={t(lang, "my.proxyMore")} />
        <div className="flex flex-col gap-2">
          {(proxies ?? []).map((p) => {
            const it = p.external_items as unknown as { source: string; title: string; title_translated: string | null; images: string[] } | null;
            return (
              <Row key={p.id} href={`/proxy/${p.id}`}
                image={it?.images?.[0]}
                title={it?.title_translated || it?.title || t(lang, "my.item")}
                sub={`${it ? t(lang, `source.${it.source as MarketSource}`) : ""} · ${PROXY_STATUS[p.status] ? t(lang, PROXY_STATUS[p.status]) : p.status}`}
                right={p.quote_total ? formatPrice(p.quote_total, "JPY") : t(lang, "proxy.quoteWait")} />
            );
          })}
          {(proxies ?? []).length === 0 && <Empty text={t(lang, "my.noProxy")} />}
        </div>
      </section>

      <section className="mt-8" aria-label={t(lang, "my.wishlist")}>
        <SectionHeader lang={lang} title={t(lang, "my.wishlist")} />
        <div className="flex flex-col gap-2">
          {(wishes ?? []).map((w) => {
            const l = w.listings as unknown as {
              id: string; title: string; price: number; currency: string; status: string; images: string[];
              source_language: string; listing_translations: { language: string; title: string }[];
            } | null;
            if (!l) return null;
            // 찜한 뒤 값이 내렸으면 앞에 알림 (메루카리 값내림 알림의 무알림 버전)
            const was = (w as { price_at_wish?: number | null }).price_at_wish;
            const drop = was && l.price < was ? `${t(lang, "my.priceDrop", { diff: formatPrice(was - l.price, l.currency as Currency) })} · ` : "";
            return (
              <Row key={l.id} href={`/listings/${l.id}`}
                image={l.images?.[0]} title={displayTitle(l, lang)}
                sub={drop + t(lang, l.status === "active" ? "status.selling" : l.status === "reserved" ? "badge.reserved" : "status.soldDone")}
                right={l.price === 0 ? t(lang, "price.free") : formatPrice(l.price, l.currency as Currency)} />
            );
          })}
          {(wishes ?? []).length === 0 && <Empty text={t(lang, "my.noWishlist")} />}
        </div>
      </section>

      <section className="mt-8" aria-label={t(lang, "my.buying")}>
        <SectionHeader lang={lang} title={t(lang, "my.buying")} />
        <div className="flex flex-col gap-2">
          {(buying ?? []).map((tx) => {
            const l = tx.listings as unknown as {
              title: string; source_language: string; images: string[];
              listing_translations: { language: string; title: string }[];
            } | null;
            return (
              <Row key={tx.id} href={`/transactions/${tx.id}`}
                image={l?.images?.[0]} title={l ? displayTitle(l, lang) : t(lang, "my.item")}
                sub={TX_STATUS[tx.status] ? t(lang, TX_STATUS[tx.status]) : tx.status}
                right={formatPrice(tx.item_price, tx.currency as Currency)} />
            );
          })}
          {(buying ?? []).length === 0 && <Empty text={t(lang, "my.noBuying")} />}
        </div>
      </section>

      <section className="mt-8" aria-label={t(lang, "my.selling")}>
        <SectionHeader lang={lang} title={t(lang, "my.selling")} href="/sell" linkLabel={t(lang, "my.sellNew")} />
        <div className="flex flex-col gap-2">
          {(selling ?? []).map((l) => (
            <Row key={l.id} href={`/listings/${l.id}`}
              image={(l.images as string[])?.[0]} title={l.title}
              sub={t(lang, l.status === "active" ? "status.selling" : l.status === "reserved" ? "badge.reserved" : "status.soldDone")}
              right={l.price === 0 ? t(lang, "price.free") : formatPrice(l.price, l.currency as Currency)} />
          ))}
          {(selling ?? []).length === 0 && <Empty text={t(lang, "profile.noListings")} />}
        </div>
      </section>

      <Link href={`/profile/${viewer.id}`}
        className="card mt-8 block p-3.5 text-center text-sm font-bold text-tomo-navy">
        {t(lang, "my.profileLink")} →
      </Link>
    </main>
  );
}

function Row({ href, image, title, sub, right }: {
  href: string; image?: string; title: string; sub: string; right: string;
}) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-3">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-5 w-8 opacity-60" /></div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink">{title}</p>
        <p className="truncate text-[12px] text-ink-soft">{sub}</p>
      </div>
      <span className="tnum shrink-0 text-[13px] font-extrabold text-ink">{right}</span>
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{text}</p>;
}

export const metadata = { title: "마이페이지 · マイページ | TOMO" };
