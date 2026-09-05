"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import { t, type Lang } from "@/lib/i18n";

// 전역 푸터 — 한 줄 메뉴 + 회사 정보, 낮게. 채팅방(h-dvh 고정)과 인증 화면에서는 숨김
// 회사/법적 정보 값은 사용자가 제공할 때까지 "준비 중". 날조 금지
export default function SiteFooter({ lang = "ko" }: { lang?: Lang }) {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding") || path.startsWith("/admin") || /^\/chat\/./.test(path)) return null;
  const LINKS = [
    ["/about", "nav.about"], ["/categories", "nav.categories"], ["/help", "nav.help"], ["/notice", "nav.notice"],
    ["/global", "nav.global"], ["/sell", "nav.sellFull"], ["/chat", "nav.chat"], ["/mypage", "nav.mypage"],
  ] as const;

  return (
    <footer className="mt-8 border-t border-tomo-navy/5 bg-tomo-ivory text-ink-soft">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 md:px-6">
        <nav aria-label={t(lang, "footer.menu")}>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] md:text-xs">
            {LINKS.map(([href, key]) => (
              <li key={href}><Link className="hover:text-ink" href={href}>{t(lang, key)}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] md:text-xs">
          <Wordmark className="text-base" />
          <span>{t(lang, "footer.tagline")}</span>
          <span>{t(lang, "footer.company")}: {t(lang, "footer.pending")}</span>
          <Link href="/chat" className="underline hover:text-ink">{t(lang, "footer.supportLink")}</Link>
          <span className="ml-auto">© 2026 TOMO · とも</span>
        </div>
      </div>
    </footer>
  );
}
