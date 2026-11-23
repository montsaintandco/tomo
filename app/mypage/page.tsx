import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t, type Lang } from "@/lib/i18n";
import HeartGauge from "@/components/HeartGauge";
import SectionHeader from "@/components/SectionHeader";
import { CountryChip } from "@/components/Brand";
import MyNav, { Empty } from "@/components/mypage/MyNav";
import { rows } from "@/lib/safe";
import { notifHref, notifText, type Notif } from "@/lib/notifications";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "마이페이지 · マイページ | TOMO", robots: { index: false } };

// 마이페이지 홈 — 프로필·신뢰온도·할 일·최근 알림. 목록은 하위 화면(/mypage/*)으로 옮겼다.
export default async function MyPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage");
  const lang: Lang = viewer.language;
  const me = viewer.id;

  const [{ data: profile }, offersInRes, offersOutRes, wishRes, shipRes, receiveRes, travelersRes, notifRes, unreadRes] = await Promise.all([
    supabase.from("profiles").select("nickname, country, region, trust_temp").eq("id", me).single(),
    supabase.from("offers").select("id, listings!inner(seller_id)", { count: "exact", head: true }).eq("listings.seller_id", me).eq("status", "pending"),
    supabase.from("offers").select("id, listings!inner(status)", { count: "exact", head: true }).eq("buyer_id", me).eq("status", "accepted").eq("listings.status", "active"),
    supabase.from("wishlists").select("price_at_wish, listings(price)").eq("user_id", me).not("price_at_wish", "is", null).limit(200),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("seller_id", me).eq("status", "paid"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("buyer_id", me).in("status", ["shipped", "shipped_international", "delivered"]),
    supabase.rpc("travelers_to", { p_country: viewer.country, p_region: viewer.region }),
    supabase.from("notifications").select("id, kind, ref_type, ref_id, data, read_at, created_at").order("created_at", { ascending: false }).limit(3),
    supabase.rpc("unread_notifications"),
  ]);

  // 할 일 — 지금 내가 움직여야 하는 것만. 링크는 하위 화면으로
  const pendingIn = offersInRes.count ?? 0;
  const acceptedOut = offersOutRes.count ?? 0;
  const drops = (wishRes.data ?? []).filter((w) => {
    const l = w.listings as unknown as { price: number } | null;
    return l && w.price_at_wish && l.price < w.price_at_wish;
  }).length;
  const toShip = shipRes.count ?? 0;
  const toReceive = receiveRes.count ?? 0;
  const travelers = typeof travelersRes.data === "number" ? travelersRes.data : 0;
  const todos: { text: string; href: string }[] = [
    ...(toShip ? [{ text: t(lang, "my.todoShip", { n: toShip }), href: "/mypage/sales?tab=tx" }] : []),
    ...(toReceive ? [{ text: t(lang, "my.todoReceive", { n: toReceive }), href: "/mypage/orders" }] : []),
    ...(pendingIn ? [{ text: t(lang, "my.todoOffersIn", { n: pendingIn }), href: "/mypage/offers" }] : []),
    ...(acceptedOut ? [{ text: t(lang, "my.todoOfferAccepted", { n: acceptedOut }), href: "/mypage/offers?tab=out" }] : []),
    ...(drops ? [{ text: t(lang, "my.todoDrop", { n: drops }), href: "/mypage/wishlist" }] : []),
    ...(travelers ? [{ text: t(lang, "trip.travelers", { n: travelers }), href: "/sell" }] : []),
  ];
  const notifs = rows(notifRes as { data: Notif[] | null; error: { code?: string } | null });
  const unread = typeof unreadRes.data === "number" ? unreadRes.data : 0;

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-none md:p-0 md:pb-16">
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
            <Link href="/mypage/edit" className="btn border-[1.5px] border-tomo-navy bg-white px-3 py-2 text-xs text-tomo-navy">{t(lang, "my.editProfile")}</Link>
          </div>
        </div>
        <HeartGauge temp={Number(profile?.trust_temp ?? 36.5)} lang={lang} />
        <Link href={`/profile/${me}`} className="press mt-3 block text-center text-[13px] font-bold text-tomo-navy">{t(lang, "my.profileLink")} →</Link>
      </div>

      <section aria-label={t(lang, "my.todo")} className="mb-8">
        <SectionHeader lang={lang} title={t(lang, "my.todo")} />
        {todos.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {todos.map((td) => (
              <li key={td.text}>
                <Link href={td.href} className="press flex items-center justify-between rounded-card bg-tomo-coral-deep/10 px-3.5 py-3 text-[13px] font-bold text-tomo-coral-deep">
                  {td.text}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden><path d="m9 5 7 7-7 7" /></svg>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty text={t(lang, "my.todoNone")} />}
      </section>

      {notifs.length > 0 && (
        <section aria-label={t(lang, "my.notif.title")} className="mb-8">
          <SectionHeader lang={lang} title={t(lang, "my.notif.title")} href="/mypage/notifications" linkLabel={unread ? t(lang, "my.notif.unread", { n: unread }) : t(lang, "my.more")} />
          <ul className="card divide-y divide-tomo-navy/5">
            {notifs.map((n) => (
              <li key={n.id}>
                <Link href={notifHref(n)} className={`press block px-4 py-3 text-[13px] ${n.read_at ? "text-ink-soft" : "font-bold text-ink"}`}>{notifText(lang, n)}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MyNav lang={lang} unread={unread} isAdmin={viewer.isAdmin} variant="list" />
    </main>
  );
}
