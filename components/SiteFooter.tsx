"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark, TomoSymbol } from "@/components/Brand";
import { t, type Lang } from "@/lib/i18n";

// 전역 푸터 — 모바일은 컴팩트, 데스크톱은 브랜드 밴드 + 메뉴. 채팅방(h-dvh 고정)과 인증 화면에서는 숨김
// 회사/법적 정보 값은 사용자가 제공할 때까지 "준비 중". 날조 금지
export default function SiteFooter({ lang = "ko" }: { lang?: Lang }) {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding") || /^\/chat\/./.test(path)) return null;

  return (
    <footer className="mt-12 border-t border-tomo-navy/5 bg-tomo-ivory text-ink-soft">
      {/* 브랜드 밴드 — 디자인 테제를 브랜드 보이스로 (데스크톱) */}
      <div className="hidden border-b border-tomo-navy/5 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-8">
          <p className="text-[22px] font-extrabold text-tomo-navy">{t(lang, "footer.thesis")}</p>
          <TomoSymbol className="h-16 w-24 shrink-0" />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:justify-between md:gap-8 md:px-6 md:py-10">
        <div>
          <Wordmark className="text-lg md:text-xl" />
          <p className="mt-2 text-[12px] md:text-sm">{t(lang, "footer.tagline")}</p>
          <p className="mt-3 hidden max-w-md text-xs leading-relaxed md:block">{t(lang, "footer.desc")}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] md:text-xs">
            <dt className="font-bold text-ink">{t(lang, "footer.company")}</dt><dd>{t(lang, "footer.pending")}</dd>
            <dt className="font-bold text-ink">{t(lang, "footer.support")}</dt><dd><Link href="/chat" className="underline hover:text-ink">{t(lang, "footer.supportLink")}</Link></dd>
          </dl>
          <p className="mt-2 text-[11px]">{t(lang, "footer.legal")}</p>
        </div>
        <nav aria-label={t(lang, "footer.menu")} className="hidden gap-12 text-sm md:flex">
          <div>
            <p className="mb-2 text-xs font-bold text-ink">{t(lang, "footer.trade")}</p>
            <ul className="flex flex-col gap-1.5">
              <li><Link className="hover:text-ink" href="/">{t(lang, "nav.home")}</Link></li>
              <li><Link className="hover:text-ink" href="/?tab=travel">{t(lang, "tab.travel")}</Link></li>
              <li><Link className="hover:text-ink" href="/global">{t(lang, "nav.global")}</Link></li>
              <li><Link className="hover:text-ink" href="/sell">{t(lang, "nav.sellFull")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-ink">{t(lang, "footer.mine")}</p>
            <ul className="flex flex-col gap-1.5">
              <li><Link className="hover:text-ink" href="/chat">{t(lang, "nav.chat")}</Link></li>
              <li><Link className="hover:text-ink" href="/mypage">{t(lang, "nav.mypage")}</Link></li>
              <li><Link className="hover:text-ink" href="/profile/me">{t(lang, "footer.profile")}</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-tomo-navy/5">
        <p className="mx-auto max-w-6xl px-4 py-3 text-[11px] md:px-6 md:py-4 md:text-xs">© 2026 TOMO · とも</p>
      </div>
    </footer>
  );
}
