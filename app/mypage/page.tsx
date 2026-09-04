import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import HeartGauge from "@/components/HeartGauge";
import SectionHeader from "@/components/SectionHeader";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import LogoutButton from "@/components/LogoutButton";
import ListingOwnerActions from "@/components/ListingOwnerActions";
import UnwishButton from "@/components/UnwishButton";
import DeactivateButton from "@/components/DeactivateButton";
import PushToggle from "@/components/PushToggle";
import { type MarketSource } from "@/lib/market/types";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "마이페이지 · マイページ | TOMO" };

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
type MiniListing = {
  id: string; title: string; price: number; currency: string; status: string; images: string[];
  source_language: string; listing_translations: { language: string; title: string }[];
};
type OfferStatus = "pending" | "accepted" | "declined";
const LISTING_SEL = "id, title, price, currency, status, images, source_language, listing_translations(language, title)";

export default async function MyPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage");
  const lang: Lang = viewer.language;
  const me = viewer.id;

  const [
    { data: profile }, { data: buying }, { data: selling }, { data: proxies }, { data: wishes },
    { data: offersIn }, { data: offersOut }, shipRes, receiveRes,
  ] = await Promise.all([
    supabase.from("profiles").select("nickname, country, region, trust_temp").eq("id", me).single(),
    supabase.from("transactions")
      .select("id, status, item_price, currency, listings(title, source_language, images, listing_translations(language, title))")
      .eq("buyer_id", me).order("created_at", { ascending: false }).limit(10),
    supabase.from("listings")
      .select("id, title, price, currency, status, images, hidden, hidden_by_admin")
      .eq("seller_id", me).order("created_at", { ascending: false }).limit(20),
    supabase.from("proxy_requests")
      .select("id, status, quote_total, order_id, external_items(source, title, title_translated, images)")
      .eq("user_id", me).order("created_at", { ascending: false }).limit(10),
    supabase.from("wishlists")
      .select(`listing_id, price_at_wish, listings(${LISTING_SEL})`)
      .eq("user_id", me).order("created_at", { ascending: false }).limit(20),
    // 받은 제안 = 내 상품에 온 것 (RLS: seller reads offers on own listings)
    supabase.from("offers")
      .select(`id, price, status, created_at, listings!inner(${LISTING_SEL}, seller_id), profiles!offers_buyer_id_fkey(nickname)`)
      .eq("listings.seller_id", me).order("created_at", { ascending: false }).limit(20),
    supabase.from("offers")
      .select(`id, price, status, created_at, listings(${LISTING_SEL})`)
      .eq("buyer_id", me).order("created_at", { ascending: false }).limit(20),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("seller_id", me).eq("status", "paid"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("buyer_id", me).in("status", ["shipped", "shipped_international", "delivered"]),
  ]);

  type OfferIn = { id: string; price: number; status: OfferStatus; listings: MiniListing; profiles: { nickname: string } | null };
  type OfferOut = { id: string; price: number; status: OfferStatus; listings: MiniListing | null };
  const inRows = (offersIn ?? []) as unknown as OfferIn[];
  const outRows = ((offersOut ?? []) as unknown as OfferOut[]).filter((o) => o.listings);
  const wishRows = ((wishes ?? []) as unknown as { listing_id: string; price_at_wish: number | null; listings: MiniListing | null }[]).filter((w) => w.listings);

  // 할 일 — 알림 인프라 없이 데이터에서 유도 (당근·메루카리의 알림 탭 역할)
  const pendingIn = inRows.filter((o) => o.status === "pending").length;
  const acceptedOut = outRows.filter((o) => o.status === "accepted" && o.listings!.status === "active").length;
  const drops = wishRows.filter((w) => w.price_at_wish && w.listings!.price < w.price_at_wish).length;
  const toShip = shipRes.count ?? 0;
  const toReceive = receiveRes.count ?? 0;
  const { data: travelersRaw } = await supabase.rpc("travelers_to", { p_country: viewer.country, p_region: viewer.region });
  const travelers = typeof travelersRaw === "number" ? travelersRaw : 0;
  const todos: { text: string; href: string }[] = [
    ...(toShip ? [{ text: t(lang, "my.todoShip", { n: toShip }), href: "#selling" }] : []),
    ...(toReceive ? [{ text: t(lang, "my.todoReceive", { n: toReceive }), href: "#buying" }] : []),
    ...(pendingIn ? [{ text: t(lang, "my.todoOffersIn", { n: pendingIn }), href: "#offers-in" }] : []),
    ...(acceptedOut ? [{ text: t(lang, "my.todoOfferAccepted", { n: acceptedOut }), href: "#offers-out" }] : []),
    ...(drops ? [{ text: t(lang, "my.todoDrop", { n: drops }), href: "#wishlist" }] : []),
    ...(travelers ? [{ text: t(lang, "trip.travelers", { n: travelers }), href: "/sell" }] : []),
  ];

  const priceOf = (l: { price: number; currency: string }) => l.price === 0 ? t(lang, "price.free") : formatPrice(l.price, l.currency as Currency);
  const statusOf = (s: string) => t(lang, s === "active" ? "status.selling" : s === "reserved" ? "badge.reserved" : "status.soldDone");

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
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {viewer.isAdmin && (
              <Link href="/admin" className="btn bg-tomo-navy px-3 py-2 text-xs text-white">{t(lang, "my.admin")}</Link>
            )}
            <Link href="/mypage/edit" className="btn border-[1.5px] border-tomo-navy bg-white px-3 py-2 text-xs text-tomo-navy">{t(lang, "my.editProfile")}</Link>
            <LogoutButton lang={lang} />
          </div>
        </div>
        <HeartGauge temp={Number(profile?.trust_temp ?? 36.5)} lang={lang} />
      </div>

      {/* 할 일 — 지금 내가 움직여야 하는 것만 */}
      <section aria-label={t(lang, "my.todo")} className="mb-8">
        <SectionHeader lang={lang} title={t(lang, "my.todo")} />
        {todos.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {todos.map((td) => (
              <li key={td.text}>
                <a href={td.href} className="press flex items-center justify-between rounded-card bg-tomo-coral-deep/10 px-3.5 py-3 text-[13px] font-bold text-tomo-coral-deep">
                  {td.text}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="m9 5 7 7-7 7" /></svg>
                </a>
              </li>
            ))}
          </ul>
        ) : <Empty text={t(lang, "my.todoNone")} />}
      </section>

      <section id="offers-in" aria-label={t(lang, "my.offersIn")}>
        <SectionHeader lang={lang} title={t(lang, "my.offersIn")} />
        <div className="flex flex-col gap-2">
          {inRows.map((o) => (
            <Row key={o.id} href={`/listings/${o.listings.id}`} image={o.listings.images?.[0]}
              title={displayTitle(o.listings, lang)}
              sub={`${o.profiles?.nickname ?? "—"} · ${t(lang, `offers.status.${o.status}`)}`}
              right={formatPrice(o.price, o.listings.currency as Currency)} />
          ))}
          {inRows.length === 0 && <Empty text={t(lang, "my.noOffers")} />}
        </div>
      </section>

      <section id="offers-out" className="mt-8" aria-label={t(lang, "my.offersOut")}>
        <SectionHeader lang={lang} title={t(lang, "my.offersOut")} />
        <div className="flex flex-col gap-2">
          {outRows.map((o) => (
            <Row key={o.id} href={`/listings/${o.listings!.id}`} image={o.listings!.images?.[0]}
              title={displayTitle(o.listings!, lang)}
              sub={t(lang, `offers.status.${o.status}`)}
              right={formatPrice(o.price, o.listings!.currency as Currency)} />
          ))}
          {outRows.length === 0 && <Empty text={t(lang, "my.noOffers")} />}
        </div>
      </section>

      <section className="mt-8" aria-label={t(lang, "my.proxy")}>
        <SectionHeader lang={lang} title={t(lang, "my.proxy")} href="/global" linkLabel={t(lang, "my.proxyMore")} />
        <div className="flex flex-col gap-2">
          {(() => {
            const seen = new Set<string>();
            const rows: typeof proxies = [];
            for (const p of proxies ?? []) {
              if (!p.order_id) { rows.push(p); continue; }
              if (seen.has(p.order_id)) continue;
              seen.add(p.order_id);
              rows.push(p);
            }
            return rows!.map((p) => {
              const it = p.external_items as unknown as { source: string; title: string; title_translated: string | null; images: string[] } | null;
              const n = p.order_id ? (proxies ?? []).filter((q) => q.order_id === p.order_id).length : 0;
              return (
                <Row key={p.id} href={p.order_id ? `/order/${p.order_id}` : `/proxy/${p.id}`} image={it?.images?.[0]}
                  title={it?.title_translated || it?.title || t(lang, "my.item")}
                  sub={`${it ? t(lang, `source.${it.source as MarketSource}`) : ""} · ${PROXY_STATUS[p.status] ? t(lang, PROXY_STATUS[p.status]) : p.status}`}
                  right={p.order_id ? t(lang, "order.items", { n }) : p.quote_total ? formatPrice(p.quote_total, "JPY") : t(lang, "proxy.quoteWait")} />
              );
            });
          })()}
          {(proxies ?? []).length === 0 && <Empty text={t(lang, "my.noProxy")} />}
        </div>
      </section>

      <section id="wishlist" className="mt-8" aria-label={t(lang, "my.wishlist")}>
        <SectionHeader lang={lang} title={t(lang, "my.wishlist")} />
        <div className="flex flex-col gap-2">
          {wishRows.map((w) => {
            const l = w.listings!;
            const drop = w.price_at_wish && l.price < w.price_at_wish
              ? `${t(lang, "my.priceDrop", { diff: formatPrice(w.price_at_wish - l.price, l.currency as Currency) })} · ` : "";
            return (
              <Row key={l.id} href={`/listings/${l.id}`} image={l.images?.[0]} title={displayTitle(l, lang)}
                sub={drop + statusOf(l.status)} right={priceOf(l)}
                extra={<UnwishButton listingId={l.id} lang={lang} />} />
            );
          })}
          {wishRows.length === 0 && <Empty text={t(lang, "my.noWishlist")} />}
        </div>
      </section>

      <section id="buying" className="mt-8" aria-label={t(lang, "my.buying")}>
        <SectionHeader lang={lang} title={t(lang, "my.buying")} />
        <div className="flex flex-col gap-2">
          {(buying ?? []).map((tx) => {
            const l = tx.listings as unknown as MiniListing | null;
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

      <section id="selling" className="mt-8" aria-label={t(lang, "my.selling")}>
        <SectionHeader lang={lang} title={t(lang, "my.selling")} href="/sell" linkLabel={t(lang, "my.sellNew")} />
        <div className="flex flex-col gap-2">
          {(selling ?? []).map((l) => (
            <div key={l.id} className="card p-3">
              <Row href={`/listings/${l.id}`} image={(l.images as string[])?.[0]} title={l.title} bare
                sub={`${statusOf(l.status)}${l.hidden ? ` · ${t(lang, "own.hidden")}` : ""}`}
                right={priceOf(l)} />
              <ListingOwnerActions listingId={l.id} status={l.status} hidden={!!l.hidden} hiddenByAdmin={!!l.hidden_by_admin} lang={lang} />
            </div>
          ))}
          {(selling ?? []).length === 0 && <Empty text={t(lang, "profile.noListings")} />}
        </div>
      </section>

      <Link href={`/profile/${me}`} className="card mt-8 block p-3.5 text-center text-sm font-bold text-tomo-navy">
        {t(lang, "my.profileLink")} →
      </Link>
      <div className="card mt-6 p-3.5"><PushToggle lang={lang} /></div>
      <div className="mt-6"><DeactivateButton lang={lang} /></div>
    </main>
  );
}

function Row({ href, image, title, sub, right, extra, bare }: {
  href: string; image?: string; title: string; sub: string; right: string; extra?: React.ReactNode; bare?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${bare ? "" : "card p-3"}`}>
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
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
      {extra}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{text}</p>;
}
