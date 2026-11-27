"use client";
// 마이페이지 메뉴 한 곳 — 데스크톱 왼쪽 메뉴(variant="side")와 모바일 홈 메뉴 목록(variant="list")이 같은 항목·순서를 본다.
// 모바일 하위 화면에서는 side 가 "← 마이페이지" 뒤로가기 줄만 그린다. 하위 화면 공용 행·빈 상태·더보기·탭도 여기 둔다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { TomoSymbol } from "@/components/Brand";
import type { BadgeKey, MyBadges } from "@/components/mypage/counts";
import { auctionEnabled } from "@/lib/auction";
import { marketBidEnabled } from "@/lib/market-bid";

// 아이콘은 24px 선 아이콘 path(새 의존성 없이 직접 그린다). badge = 미확인 숫자 키(counts.ts myBadges)
const ALL_ITEMS: { href: string; key: I18nKey; icon: string; badge?: BadgeKey }[] = [
  { href: "/mypage", key: "my.nav.home", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { href: "/mypage/orders", key: "my.nav.orders", icon: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2", badge: "orders" },
  { href: "/mypage/sales", key: "my.nav.sales", icon: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01", badge: "sales" },
  { href: "/mypage/auctions", key: "auction.my.title", icon: "m14 3 7 7M11 6l7 7M9.5 7.5l6-6M3 21l8-8M12.5 16.5l6-6", badge: "auctions" },
  { href: "/mypage/bids", key: "mb.my.title", icon: "M4 20h16M6 16l6-12 6 12M9 11h6" },
  { href: "/mypage/offers", key: "my.nav.offers", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h8", badge: "offers" },
  { href: "/mypage/payouts", key: "my.nav.payouts", icon: "M3 7h18v13H3zM3 7l3-4h12l3 4M16 14h.01" },
  { href: "/mypage/wishlist", key: "my.nav.wishlist", icon: "M12 20s-8-4.9-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.1-8 11-8 11z" },
  { href: "/mypage/notifications", key: "my.nav.notifications", icon: "M6 9a6 6 0 0 1 12 0c0 6 3 8 3 8H3s3-2 3-8M10.3 21a1.9 1.9 0 0 0 3.4 0", badge: "notifications" },
  { href: "/mypage/support", key: "my.nav.support", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.2 9a3 3 0 0 1 5.6 1c0 2-2.8 2.5-2.8 4M12 17.5h.01" },
  { href: "/mypage/addresses", key: "my.nav.addresses", icon: "M19 10c0 6-7 11-7 11s-7-5-7-11a7 7 0 0 1 14 0zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { href: "/mypage/settings", key: "my.nav.settings", icon: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" },
];
// 경매·입찰 신청 메뉴는 각 플래그가 켜져 있을 때만(빌드 때 정해진다)
const ITEMS = ALL_ITEMS.filter((it) => (it.href !== "/mypage/auctions" || auctionEnabled()) && (it.href !== "/mypage/bids" || marketBidEnabled()));
const ADMIN_ICON = "M12 21s7-3.5 7-9V5l-7-2.5L5 5v7c0 5.5 7 9 7 9z";

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden><path d={d} /></svg>
);
const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-faint" aria-hidden><path d="m9 5 7 7-7 7" /></svg>
);
const Badge = ({ n, lang }: { n: number; lang: Lang }) => (
  <span aria-label={t(lang, "my.badgeAria", { n })} className="tnum ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-tomo-coral-deep px-1.5 text-[11px] font-bold text-white">{n > 99 ? "99+" : n}</span>
);

export default function MyNav({ lang, badges = {}, isAdmin = false, variant = "side" }: {
  lang: Lang; badges?: Partial<MyBadges>; isAdmin?: boolean; variant?: "side" | "list";
}) {
  const count = (k?: BadgeKey) => (k ? badges[k] ?? 0 : 0);
  const path = usePathname();
  const active = (href: string) => (href === "/mypage" ? path === "/mypage" : path === href || path.startsWith(href + "/"));

  if (variant === "list") {
    // 모바일 홈 — 메뉴 목록(데스크톱은 왼쪽 메뉴가 있어 숨김). 홈 자신은 뺀다
    return (
      <nav aria-label={t(lang, "my.nav.menu")} className="md:hidden">
        <ul className="card divide-y divide-tomo-navy/5">
          {ITEMS.slice(1).map((it) => (
            <li key={it.href}>
              <Link href={it.href} className="press flex min-h-12 items-center gap-3 px-4 text-[14px] text-ink">
                <span className="text-ink-soft"><Icon d={it.icon} /></span>
                {t(lang, it.key)}
                {count(it.badge) > 0 ? <Badge n={count(it.badge)} lang={lang} /> : <span className="ml-auto" />}
                <Chevron />
              </Link>
            </li>
          ))}
          {isAdmin && (
            <li><Link href="/admin" className="press flex min-h-12 items-center gap-3 px-4 text-[14px] font-bold text-tomo-navy"><Icon d={ADMIN_ICON} />{t(lang, "my.admin")}<span className="ml-auto" /><Chevron /></Link></li>
          )}
        </ul>
      </nav>
    );
  }

  const showBack = path !== "/mypage" && !path.startsWith("/mypage/edit"); // 편집 화면은 자기 뒤로가기가 있다
  return (
    <>
      {showBack && (
        <div className="px-4 pt-3 md:hidden">
          <Link href="/mypage" className="press inline-flex min-h-11 items-center gap-1 text-[13px] font-bold text-tomo-navy">← {t(lang, "my.nav.back")}</Link>
        </div>
      )}
      <nav aria-label={t(lang, "my.nav.menu")} className="hidden w-48 shrink-0 md:block">
        <ul className="sticky top-24 flex flex-col gap-0.5">
          {ITEMS.map((it) => (
            <li key={it.href}>
              <Link href={it.href} aria-current={active(it.href) ? "page" : undefined}
                className={`press flex min-h-10 items-center gap-2.5 rounded-card px-3 text-[14px] ${
                  active(it.href) ? "bg-tomo-navy/5 font-bold text-ink" : "text-ink-soft hover:text-ink"}`}>
                <Icon d={it.icon} />
                {t(lang, it.key)}
                {count(it.badge) > 0 && <Badge n={count(it.badge)} lang={lang} />}
              </Link>
            </li>
          ))}
          {isAdmin && (
            <li className="mt-2 border-t border-tomo-navy/5 pt-2">
              <Link href="/admin" className="press flex min-h-10 items-center gap-2.5 rounded-card px-3 text-[14px] font-bold text-tomo-navy"><Icon d={ADMIN_ICON} />{t(lang, "my.admin")}</Link>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}

// ── 하위 화면 공용 ──
export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-4 text-[17px] font-extrabold leading-tight text-ink md:text-xl">{children}</h1>;
}

export function Tabs({ tabs }: { tabs: { href: string; label: string; active: boolean }[] }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1.5">
      {tabs.map((tb) => (
        <Link key={tb.href} href={tb.href} role="tab" aria-selected={tb.active} scroll={false}
          className={`press rounded-full px-3.5 py-2 text-[13px] font-bold ${tb.active ? "bg-tomo-navy text-white" : "bg-tomo-navy/5 text-ink-soft"}`}>
          {tb.label}
        </Link>
      ))}
    </div>
  );
}

export function Row({ href, image, title, sub, right, extra, bare }: {
  href: string; image?: string; title: string; sub: string; right: React.ReactNode; extra?: React.ReactNode; bare?: boolean;
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

export function Empty({ text }: { text: string }) {
  return <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">{text}</p>;
}

/** 20건씩 더보기 — href 는 다음 page 값이 들어간 주소 */
export function More({ href, lang }: { href: string | null; lang: Lang }) {
  if (!href) return null;
  return (
    <Link href={href} scroll={false} className="press mt-3 block rounded-card bg-tomo-navy/5 py-3 text-center text-[13px] font-bold text-ink">
      {t(lang, "my.more")}
    </Link>
  );
}
