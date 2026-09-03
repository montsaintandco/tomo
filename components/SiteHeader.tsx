"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";

// 데스크톱 전용 GNB — 모바일 BottomNav와 같은 IA를 상단 바로 올린 것
const LINKS = [
  { href: "/", label: "홈" },
  { href: "/global", label: "해외직구" },
  { href: "/chat", label: "채팅" },
  { href: "/mypage", label: "마이페이지" },
] as const;

export default function SiteHeader() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding")) return null;

  return (
    <header className="sticky top-0 z-30 hidden border-b border-tomo-navy/5 bg-white/95 backdrop-blur md:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="press shrink-0" aria-label="TOMO 홈">
          <Wordmark />
        </Link>
        <nav aria-label="주요 메뉴">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => {
              const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link href={l.href} aria-current={active ? "page" : undefined}
                    className={`press block rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                      active ? "bg-tomo-navy text-white" : "text-ink-soft hover:text-ink"}`}>
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Link href="/sell" className="btn ml-auto flex items-center gap-1.5 bg-tomo-coral-deep px-5 py-2 text-sm text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
            strokeLinecap="round" className="h-4 w-4" aria-hidden>
            <path d="M12 5.5v13M5.5 12h13" />
          </svg>
          판매하기
        </Link>
      </div>
    </header>
  );
}
