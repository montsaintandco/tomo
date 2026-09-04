"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import LangToggle from "@/components/LangToggle";
import { t, type Lang } from "@/lib/i18n";

// 사이트 GNB — 브라우저에서는 모바일·데스크톱 모두 상단 헤더(웹사이트 문법).
// 홈 화면에 설치한 standalone 앱에서는 모바일에서 숨기고 BottomNav가 대신한다.
const LINKS = [
  { href: "/", label: "nav.home" },
  { href: "/global", label: "nav.global" },
  { href: "/chat", label: "nav.chat" },
  { href: "/mypage", label: "nav.mypage" },
] as const;

const ICONS: Record<string, React.ReactNode> = {
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z" /></>,
  chat: <path d="M4 5.5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7.5L8 20v-4.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" /></>,
};
const MOBILE = [
  { href: "/global", label: "nav.global", icon: "globe" },
  { href: "/chat", label: "nav.chat", icon: "chat" },
  { href: "/mypage", label: "nav.my", icon: "user" },
] as const;

export default function SiteHeader({ lang = "ko", unread = 0, cartCount = 0 }: { lang?: Lang; unread?: number; cartCount?: number }) {
  const path = usePathname();
  const [count, setCount] = useState(cartCount);
  const [prevCartCount, setPrevCartCount] = useState(cartCount);
  if (cartCount !== prevCartCount) { setPrevCartCount(cartCount); setCount(cartCount); }
  useEffect(() => {
    const on = (e: Event) => setCount(Number((e as CustomEvent).detail ?? 0));
    window.addEventListener("tomo:cart", on); return () => window.removeEventListener("tomo:cart", on);
  }, []);
  if (path.startsWith("/login") || path.startsWith("/onboarding")) return null;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-tomo-navy/5 bg-white/95 backdrop-blur standalone:hidden md:block">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:gap-8 md:px-6">
        <Link href="/" className="press shrink-0" aria-label="TOMO">
          <Wordmark />
        </Link>

        {/* 데스크톱 텍스트 내비 */}
        <nav aria-label={t(lang, "nav.main")} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
                  className={`press block rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    isActive(l.href) ? "bg-tomo-navy text-white" : "text-ink-soft hover:text-ink"}`}>
                  {t(lang, l.label)}
                  {l.href === "/chat" && unread > 0 && (
                    <span className="tnum ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tomo-coral-deep px-1 text-[11px] font-bold text-white" aria-label={t(lang, "chat.unread", { n: unread })}>{unread > 9 ? "9+" : unread}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 md:gap-4">
          <LangToggle lang={lang} label={t(lang, "lang.toggle")} />

          <Link href="/cart" aria-label={t(lang, "cart.count", { n: count })} aria-current={isActive("/cart") ? "page" : undefined}
            className={`press relative flex h-11 w-9 items-center justify-center rounded-full ${isActive("/cart") ? "text-tomo-navy" : "text-ink-soft"}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
              <path d="M3.5 4.5h2l2.2 10.5h10.6l1.9-7.5H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" />
            </svg>
            {count > 0 && (
              <span className="tnum absolute -right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tomo-coral-deep px-1 text-[11px] font-bold text-white">{count > 9 ? "9+" : count}</span>
            )}
          </Link>

          {/* 모바일 아이콘 내비 — 44px 히트영역 */}
          <nav aria-label={t(lang, "nav.main")} className="md:hidden">
            <ul className="flex items-center">
              {MOBILE.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} aria-label={t(lang, m.label)} aria-current={isActive(m.href) ? "page" : undefined}
                    className={`press relative flex h-11 w-9 items-center justify-center rounded-full ${
                      isActive(m.href) ? "text-tomo-navy" : "text-ink-soft"}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive(m.href) ? 2.1 : 1.7}
                      strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
                      {ICONS[m.icon]}
                    </svg>
                    {m.href === "/chat" && unread > 0 && (
                      <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-tomo-coral-deep" aria-label={t(lang, "chat.unread", { n: unread })} />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* 모바일은 아이콘만(카트 추가로 375px가 꽉 참) — 라벨은 aria-label로 */}
          <Link href="/sell" aria-label={t(lang, "nav.sellFull")}
            className="btn flex h-10 w-10 shrink-0 items-center justify-center whitespace-nowrap bg-tomo-coral-deep p-0 text-sm text-white md:h-auto md:w-auto md:gap-1.5 md:px-5 md:py-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
              strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M12 5.5v13M5.5 12h13" />
            </svg>
            <span className="hidden md:inline">{t(lang, "nav.sellFull")}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
