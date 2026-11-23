"use client";
// 마이페이지 메뉴 한 곳 — 데스크톱 왼쪽 메뉴(variant="side")와 모바일 홈 메뉴 목록(variant="list")이 같은 항목·순서를 본다.
// 모바일 하위 화면에서는 side 가 "← 마이페이지" 뒤로가기 줄만 그린다. 하위 화면 공용 행·빈 상태·더보기·탭도 여기 둔다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { TomoSymbol } from "@/components/Brand";

const ITEMS: { href: string; key: I18nKey; unread?: boolean }[] = [
  { href: "/mypage", key: "my.nav.home" },
  { href: "/mypage/orders", key: "my.nav.orders" },
  { href: "/mypage/sales", key: "my.nav.sales" },
  { href: "/mypage/offers", key: "my.nav.offers" },
  { href: "/mypage/payouts", key: "my.nav.payouts" },
  { href: "/mypage/wishlist", key: "my.nav.wishlist" },
  { href: "/mypage/notifications", key: "my.nav.notifications", unread: true },
  { href: "/mypage/support", key: "my.nav.support" },
  { href: "/mypage/addresses", key: "my.nav.addresses" },
  { href: "/mypage/settings", key: "my.nav.settings" },
];

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-faint" aria-hidden><path d="m9 5 7 7-7 7" /></svg>
);
const Badge = ({ n }: { n: number }) => (
  <span className="tnum ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-tomo-coral-deep px-1.5 text-[11px] font-bold text-white">{n > 99 ? "99+" : n}</span>
);

export default function MyNav({ lang, unread = 0, isAdmin = false, variant = "side" }: {
  lang: Lang; unread?: number; isAdmin?: boolean; variant?: "side" | "list";
}) {
  const path = usePathname();
  const active = (href: string) => (href === "/mypage" ? path === "/mypage" : path === href || path.startsWith(href + "/"));

  if (variant === "list") {
    // 모바일 홈 — 메뉴 목록(데스크톱은 왼쪽 메뉴가 있어 숨김). 홈 자신은 뺀다
    return (
      <nav aria-label={t(lang, "my.nav.menu")} className="md:hidden">
        <ul className="card divide-y divide-tomo-navy/5">
          {ITEMS.slice(1).map((it) => (
            <li key={it.href}>
              <Link href={it.href} className="press flex min-h-12 items-center gap-2 px-4 text-[14px] text-ink">
                {t(lang, it.key)}
                {it.unread && unread > 0 ? <Badge n={unread} /> : <span className="ml-auto" />}
                <Chevron />
              </Link>
            </li>
          ))}
          {isAdmin && (
            <li><Link href="/admin" className="press flex min-h-12 items-center px-4 text-[14px] font-bold text-tomo-navy">{t(lang, "my.admin")}<span className="ml-auto" /><Chevron /></Link></li>
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
                className={`press flex min-h-10 items-center gap-2 rounded-card px-3 text-[14px] ${
                  active(it.href) ? "bg-tomo-navy/5 font-bold text-ink" : "text-ink-soft hover:text-ink"}`}>
                {t(lang, it.key)}
                {it.unread && unread > 0 && <Badge n={unread} />}
              </Link>
            </li>
          ))}
          {isAdmin && (
            <li className="mt-2 border-t border-tomo-navy/5 pt-2">
              <Link href="/admin" className="press flex min-h-10 items-center rounded-card px-3 text-[14px] font-bold text-tomo-navy">{t(lang, "my.admin")}</Link>
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
