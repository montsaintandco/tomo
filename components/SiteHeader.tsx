"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import LangToggle from "@/components/LangToggle";
import { t, type Lang } from "@/lib/i18n";

// 사이트 GNB — 사줘(SAZO)식 검색 우선 헤더: [로고 | 검색창(키워드·URL) | KR/JP·카트·로그인/마이·판매] + 2열: 홈·서비스 소개·카테고리·고객센터·공지사항 (사줘와 같은 구성).
// 브라우저에서는 모바일·데스크톱 모두 상단 헤더. 홈 화면에 설치한 standalone 앱에서는 모바일에서 숨기고 BottomNav가 대신한다.
const ICONS: Record<string, React.ReactNode> = {
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z" /></>,
  chat: <path d="M4 5.5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7.5L8 20v-4.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" /></>,
  cart: <><path d="M3.5 4.5h2l2.2 10.5h10.6l1.9-7.5H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
};
const LINKS = [
  { href: "/", label: "nav.home" },
  { href: "/about", label: "nav.about" },
  { href: "/categories", label: "nav.categories" },
  { href: "/help", label: "nav.help" },
  { href: "/notice", label: "nav.notice" },
] as const;
const MOBILE = [
  { href: "/global", label: "nav.global", icon: "globe" },
  { href: "/chat", label: "nav.chat", icon: "chat" },
  { href: "/mypage", label: "nav.my", icon: "user" },
] as const;

function Icon({ name, className = "h-[22px] w-[22px]", stroke = 1.7 }: { name: string; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export default function SiteHeader({ lang = "ko", unread = 0, cartCount = 0, loggedIn = false }: {
  lang?: Lang; unread?: number; cartCount?: number; loggedIn?: boolean;
}) {
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
  const iconBtn = (active: boolean) =>
    `press relative flex h-11 w-9 items-center justify-center rounded-full md:w-10 ${active ? "text-tomo-navy" : "text-ink-soft hover:text-ink"}`;

  return (
    <header className="sticky top-0 z-30 border-b border-tomo-navy/5 bg-white/95 backdrop-blur standalone:hidden md:block">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:gap-6 md:px-6">
        <Link href="/" className="press shrink-0" aria-label="TOMO">
          <Wordmark />
        </Link>

        {/* 사줘식 검색창 — 키워드든 상품 URL이든 여기 하나. /global이 URL은 상세로 보낸다 */}
        <form action="/global" role="search" className="relative hidden min-w-0 flex-1 md:block md:max-w-xl">
          <label htmlFor="gnb-q" className="sr-only">{t(lang, "search.label")}</label>
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"><Icon name="search" className="h-[18px] w-[18px]" stroke={2} /></span>
          <input id="gnb-q" name="q" type="search" enterKeyHint="search" autoComplete="off" placeholder={t(lang, "nav.searchPlaceholder")}
            className="w-full rounded-full bg-tomo-ivory py-2.5 pl-11 pr-4 text-sm placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-tomo-navy/30" />
        </form>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <LangToggle lang={lang} label={t(lang, "lang.toggle")} />

          <Link href="/cart" aria-label={t(lang, "cart.count", { n: count })} aria-current={isActive("/cart") ? "page" : undefined} className={iconBtn(isActive("/cart"))}>
            <Icon name="cart" stroke={1.8} />
            {count > 0 && (
              <span className="tnum absolute -right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tomo-coral-deep px-1 text-[11px] font-bold text-white">{count > 9 ? "9+" : count}</span>
            )}
          </Link>

          {/* 모바일 아이콘 내비 — 44px 히트영역 */}
          <nav aria-label={t(lang, "nav.main")} className="md:hidden">
            <ul className="flex items-center">
              {MOBILE.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} aria-label={t(lang, m.label)} aria-current={isActive(m.href) ? "page" : undefined} className={iconBtn(isActive(m.href))}>
                    <Icon name={m.icon} stroke={isActive(m.href) ? 2.1 : 1.7} />
                    {m.href === "/chat" && unread > 0 && (
                      <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-tomo-coral-deep" aria-label={t(lang, "chat.unread", { n: unread })} />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* 데스크톱: 로그인 전엔 로그인 필, 후엔 채팅·마이 아이콘 */}
          {loggedIn ? (
            <div className="hidden items-center md:flex">
              <Link href="/chat" aria-label={t(lang, "nav.chat")} aria-current={isActive("/chat") ? "page" : undefined} className={iconBtn(isActive("/chat"))}>
                <Icon name="chat" />
                {unread > 0 && <span className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-tomo-coral-deep" aria-label={t(lang, "chat.unread", { n: unread })} />}
              </Link>
              <Link href="/mypage" aria-label={t(lang, "nav.mypage")} aria-current={isActive("/mypage") ? "page" : undefined} className={iconBtn(isActive("/mypage"))}>
                <Icon name="user" />
              </Link>
            </div>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(path)}`}
              className="press hidden rounded-full border-[1.5px] border-tomo-navy/20 px-4 py-2 text-sm font-bold text-tomo-navy hover:border-tomo-navy/50 md:block">
              {t(lang, "nav.login")}
            </Link>
          )}

          {/* 모바일은 아이콘만(카트 추가로 375px가 꽉 참) — 라벨은 aria-label로 */}
          <Link href="/sell" aria-label={t(lang, "nav.sellFull")}
            className="btn ml-1 flex h-10 w-10 shrink-0 items-center justify-center whitespace-nowrap bg-tomo-coral-deep p-0 text-sm text-white md:h-auto md:w-auto md:gap-1.5 md:px-5 md:py-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M12 5.5v13M5.5 12h13" />
            </svg>
            <span className="hidden md:inline">{t(lang, "nav.sellFull")}</span>
          </Link>
        </div>
      </div>

      {/* 2열 — 정보 페이지 내비 (사줘: 홈·서비스 소개·카테고리·고객센터·공지사항). 모바일은 가로 스크롤 */}
      <nav aria-label={t(lang, "nav.main")} className="border-t border-tomo-navy/5">
        <ul className="mx-auto flex h-9 max-w-6xl items-stretch gap-5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:gap-6 md:px-6">
          {LINKS.map((l) => (
            <li key={l.href} className="flex shrink-0">
              <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
                className={`flex items-center border-b-2 text-[13px] font-bold transition-colors ${
                  isActive(l.href) ? "border-tomo-navy text-tomo-navy" : "border-transparent text-ink-soft hover:text-ink"}`}>
                {t(lang, l.label)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
