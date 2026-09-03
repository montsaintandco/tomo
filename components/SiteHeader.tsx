"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import LangToggle from "@/components/LangToggle";
import { t, type Lang } from "@/lib/i18n";

// 데스크톱 전용 GNB — 모바일 BottomNav와 같은 IA를 상단 바로 올린 것
const LINKS = [
  { href: "/", label: "nav.home" },
  { href: "/global", label: "nav.global" },
  { href: "/chat", label: "nav.chat" },
  { href: "/mypage", label: "nav.mypage" },
] as const;

export default function SiteHeader({ lang = "ko" }: { lang?: Lang }) {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding")) return null;

  return (
    <header className="sticky top-0 z-30 hidden border-b border-tomo-navy/5 bg-white/95 backdrop-blur md:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="press shrink-0" aria-label="TOMO">
          <Wordmark />
        </Link>
        <nav aria-label={t(lang, "nav.main")}>
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => {
              const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link href={l.href} aria-current={active ? "page" : undefined}
                    className={`press block rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                      active ? "bg-tomo-navy text-white" : "text-ink-soft hover:text-ink"}`}>
                    {t(lang, l.label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <LangToggle lang={lang} label={t(lang, "lang.toggle")} />
          <Link href="/sell" className="btn flex items-center gap-1.5 bg-tomo-coral-deep px-5 py-2 text-sm text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
              strokeLinecap="round" className="h-4 w-4" aria-hidden>
              <path d="M12 5.5v13M5.5 12h13" />
            </svg>
            {t(lang, "nav.sellFull")}
          </Link>
        </div>
      </div>
    </header>
  );
}
