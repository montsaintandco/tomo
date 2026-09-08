"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";
import { t, type Lang } from "@/lib/i18n";

// 전역 푸터 — 정보성 링크 + 약관류 + 사업자 정보(전자상거래법 필수 표기·토스 심사 항목: 상호·대표자·주소·전화·사업자등록번호·통신판매업 신고번호).
// 사업자 값은 서버에서 읽어 props로(클라이언트 컴포넌트라 env 직접 접근 대신). 채팅방·인증·어드민에서는 숨김
export type CompanyInfo = {
  name: string | null; ceo: string | null; bizNo: string | null; mailOrderNo: string | null; address: string | null;
  phone: string | null; email: string | null; hours: string | null; hosting: string; bizLookupUrl: string | null;
};

export default function SiteFooter({ lang = "ko", company }: { lang?: Lang; company: CompanyInfo }) {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding") || path.startsWith("/admin") || /^\/chat\/./.test(path)) return null;
  const hasBar = /^\/(listings|global)\/./.test(path); // 상세는 모바일 하단 고정 구매 바 — 푸터가 그 아래 깔리지 않게 여백
  const LINKS = [
    ["/guide", "nav.guide"], ["/about", "nav.about"], ["/categories", "nav.categories"], ["/help", "nav.help"], ["/notice", "nav.notice"], ["/global", "nav.global"],
  ] as const;
  const na = t(lang, "footer.pending");
  const row: [string, string | null][] = [
    [t(lang, "footer.name"), company.name], [t(lang, "footer.ceo"), company.ceo],
    [t(lang, "footer.bizNo"), company.bizNo], [t(lang, "footer.mailOrderNo"), company.mailOrderNo],
    [t(lang, "footer.address"), company.address], [t(lang, "footer.phone"), company.phone ?? t(lang, "footer.oneToOne")], // 전화가 없으면 1:1 문의 경로를 적는다
    [t(lang, "footer.email"), company.email], [t(lang, "footer.hours"), company.hours], [t(lang, "footer.hosting"), company.hosting],
  ];

  return (
    <footer className={`mt-auto border-t border-tomo-navy/5 bg-tomo-ivory text-ink-soft ${hasBar ? "pb-20 standalone:pb-36 md:pb-0" : ""}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 md:px-6">
        <nav aria-label={t(lang, "footer.menu")} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] md:text-xs">
          {LINKS.map(([href, key]) => <Link key={href} className="hover:text-ink" href={href}>{t(lang, key)}</Link>)}
          <span aria-hidden className="text-ink-faint">|</span>
          <Link className="font-bold text-ink hover:underline" href="/terms">{t(lang, "footer.terms")}</Link>
          <Link className="font-bold text-ink hover:underline" href="/privacy">{t(lang, "footer.privacy")}</Link>
          <Link className="hover:text-ink" href="/refund">{t(lang, "footer.refund")}</Link>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs">
          <Wordmark className="text-base" />
          <span>{t(lang, "footer.tagline")}</span>
        </div>
        {/* 사업자 정보 — 한 줄씩 끊지 않고 · 로 이어 붙인 표기 (당근·메루카리 푸터 형식) */}
        <p className="text-[11px] leading-relaxed">
          {row.map(([k, v], i) => (
            <span key={k}>{i > 0 && <span aria-hidden> · </span>}<span className="text-ink-faint">{k}</span> {v ?? na}</span>
          ))}
          {company.bizLookupUrl && <> · <a href={company.bizLookupUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">{t(lang, "footer.bizLookup")}</a></>}
        </p>
        <p className="text-[11px] leading-relaxed text-ink-faint">{t(lang, "footer.disclaimer")}</p>
        <p className="text-[11px]">© 2026 {company.name ?? "TOMO"} · TOMO · とも</p>
      </div>
    </footer>
  );
}
