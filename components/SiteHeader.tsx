"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import LangToggle from "@/components/LangToggle";
import NotificationBell from "@/components/NotificationBell";
import { useMe } from "@/components/shell/HeaderCounts";
import { t, type Lang } from "@/lib/i18n";

// 사이트 GNB — 사줘(SAZO)식 검색 우선 헤더: [로고 | 검색창(키워드·URL) | KR/JP·카트·로그인/마이·판매] + 2열: 홈·서비스 소개·카테고리·고객센터·공지사항 (사줘와 같은 구성).
// 모바일(브라우저)은 하단 탭(BottomNav)이 검색·판매·채팅·마이를 맡는다. 헤더는 [로고 | KR/JP·카트·메뉴]만, 2열 메뉴는 「메뉴」 버튼 안으로 접는다.
// 홈 화면에 설치한 standalone 앱에서는 모바일에서 헤더를 숨긴다.
// 로그인·숫자는 레이아웃이 DB를 기다리지 않도록 useMe(쿠키 추정 → /api/me/summary)로 받는다.
const ICONS: Record<string, React.ReactNode> = {
  chat: <path d="M4 5.5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7.5L8 20v-4.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" /></>,
  cart: <><path d="M3.5 4.5h2l2.2 10.5h10.6l1.9-7.5H7" /><circle cx="9.5" cy="19" r="1.3" /><circle cx="17" cy="19" r="1.3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};
const LINKS = [
  { href: "/", label: "nav.home" },
  { href: "/travel", label: "nav.travel" },
  { href: "/guide", label: "nav.guide" },
  { href: "/about", label: "nav.about" },
  { href: "/categories", label: "nav.categories" },
  { href: "/help", label: "nav.help" },
  { href: "/notice", label: "nav.notice" },
] as const;

function Icon({ name, className = "h-[22px] w-[22px]", stroke = 1.7 }: { name: string; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

export default function SiteHeader({ lang = "ko", loggedIn: loggedInGuess = false }: { lang?: Lang; loggedIn?: boolean }) {
  const path = usePathname();
  const { loggedIn, unread, cart: cartCount, notif } = useMe(loggedInGuess);
  const [count, setCount] = useState(cartCount);
  const [prevCartCount, setPrevCartCount] = useState(cartCount);
  if (cartCount !== prevCartCount) { setPrevCartCount(cartCount); setCount(cartCount); }
  // 모바일 메뉴 — 페이지를 옮기면 닫는다
  const [menu, setMenu] = useState(false);
  const [menuPath, setMenuPath] = useState(path);
  if (path !== menuPath) { setMenuPath(path); setMenu(false); }
  useEffect(() => {
    const on = (e: Event) => setCount(Number((e as CustomEvent).detail ?? 0));
    window.addEventListener("tomo:cart", on); return () => window.removeEventListener("tomo:cart", on);
  }, []);
  if (path.startsWith("/login") || path.startsWith("/onboarding") || path.startsWith("/admin")) return null;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // 아이콘 버튼은 모바일·데스크톱 모두 44px 히트영역
  const iconBtn = (active: boolean) =>
    `press relative flex h-11 w-11 items-center justify-center rounded-full ${active ? "text-tomo-navy" : "text-ink-soft hover:text-ink"}`;

  return (
    <header className="sticky top-0 z-30 border-b border-tomo-navy/5 bg-white/95 backdrop-blur standalone:hidden md:block">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:h-16 md:gap-6 md:px-6">
        <Link href="/" className="press shrink-0" aria-label="TOMO">
          <Wordmark />
        </Link>

        {/* 사줘식 검색창 — 키워드든 상품 URL이든 여기 하나. /global이 URL은 상세로 보낸다. 모바일은 하단 탭 「검색」 */}
        <form action="/global" role="search" className="relative hidden min-w-0 flex-1 md:block md:max-w-xl">
          <label htmlFor="gnb-q" className="sr-only">{t(lang, "search.label")}</label>
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft"><Icon name="search" className="h-[18px] w-[18px]" stroke={2} /></span>
          <input id="gnb-q" name="q" type="search" enterKeyHint="search" autoComplete="off" placeholder={t(lang, "nav.searchPlaceholder")}
            className="w-full rounded-full bg-tomo-ivory py-2.5 pl-11 pr-4 text-sm placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-tomo-navy/30" />
        </form>

        <div className="ml-auto flex items-center gap-0.5 md:gap-2">
          <LangToggle lang={lang} label={t(lang, "lang.toggle")} />

          <Link href="/cart" aria-label={t(lang, "cart.count", { n: count })} aria-current={isActive("/cart") ? "page" : undefined} className={iconBtn(isActive("/cart"))}>
            <Icon name="cart" stroke={1.8} />
            {count > 0 && (
              <span className="tnum absolute right-0.5 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tomo-coral-deep px-1 text-[11px] font-bold text-white">{count > 9 ? "9+" : count}</span>
            )}
          </Link>

          {/* 모바일: 2열 메뉴를 접은 버튼 */}
          <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-controls="gnb-menu"
            aria-label={t(lang, menu ? "shell.menuClose" : "shell.menu")} className={`${iconBtn(menu)} md:hidden`}>
            <Icon name={menu ? "close" : "menu"} stroke={1.9} />
          </button>

          {/* 데스크톱: 로그인 전엔 로그인 필, 후엔 채팅·알림·마이 아이콘 */}
          {loggedIn ? (
            <div className="hidden items-center md:flex">
              <Link href="/chat" aria-label={t(lang, "nav.chat")} aria-current={isActive("/chat") ? "page" : undefined} className={iconBtn(isActive("/chat"))}>
                <Icon name="chat" />
                {unread > 0 && <span className="absolute right-1.5 top-2 h-2 w-2 rounded-full bg-tomo-coral-deep" aria-label={t(lang, "chat.unread", { n: unread })} />}
              </Link>
              <NotificationBell lang={lang} count={notif} active={path.startsWith("/mypage/notifications")} />
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

          {/* 판매는 데스크톱만 — 모바일은 하단 탭 가운데 버튼 */}
          <Link href="/sell" aria-label={t(lang, "nav.sellFull")}
            className="btn ml-1 hidden shrink-0 items-center justify-center gap-1.5 whitespace-nowrap bg-tomo-coral-deep px-5 py-2 text-sm text-white md:flex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M12 5.5v13M5.5 12h13" />
            </svg>
            <span>{t(lang, "nav.sellFull")}</span>
          </Link>
        </div>
      </div>

      {/* 2열 — 정보 페이지 내비 (사줘: 홈·서비스 소개·카테고리·고객센터·공지사항). 모바일은 「메뉴」 버튼을 누르면 세로 목록으로 펼친다 */}
      <nav id="gnb-menu" aria-label={t(lang, "nav.main")} className={`border-t border-tomo-navy/5 ${menu ? "block" : "hidden"} md:block`}>
        <ul className="mx-auto flex max-w-6xl flex-col px-2 py-1 md:h-11 md:flex-row md:items-stretch md:gap-6 md:px-6 md:py-0">
          {LINKS.map((l) => (
            <li key={l.href} className="flex shrink-0">
              <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined}
                className={`flex min-h-11 w-full items-center px-2 text-[15px] font-bold transition-colors md:min-h-0 md:w-auto md:border-b-2 md:px-0 md:text-[13px] ${
                  isActive(l.href) ? "text-tomo-navy md:border-tomo-navy" : "text-ink-soft hover:text-ink md:border-transparent"}`}>
                {t(lang, l.label)}
              </Link>
            </li>
          ))}
          {!loggedIn && (
            <li className="flex shrink-0 md:hidden">
              <Link href={`/login?next=${encodeURIComponent(path)}`} className="flex min-h-11 w-full items-center px-2 text-[15px] font-bold text-tomo-navy">{t(lang, "nav.login")}</Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}