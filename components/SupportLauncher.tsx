"use client";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import SupportBot from "@/components/SupportBot";
import { t, type Lang } from "@/lib/i18n";

// 플로팅 문의 버튼 — 사조처럼 우하단. 열면 모바일 바텀시트 / 데스크톱 우하단 패널. 채팅방·인증·어드민·고객센터(인라인 봇)에서는 숨김
export default function SupportLauncher({ lang, loggedIn }: { lang: Lang; loggedIn: boolean }) {
  const path = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  if (/^\/(login|onboarding|admin|help)/.test(path) || /^\/chat\/./.test(path)) return null;
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-label={t(lang, "support.title")}
        className="press fixed bottom-4 right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-tomo-navy pl-4 pr-5 text-sm font-bold text-white shadow-lift standalone:bottom-[74px] md:bottom-6 md:right-6">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" /></svg>
        {t(lang, "support.cta")}
      </button>
      <dialog ref={ref} aria-label={t(lang, "support.title")}
        className="sheet m-0 mt-auto w-full max-w-md rounded-t-card bg-white p-0 shadow-lift backdrop:bg-tomo-navy/40 md:bottom-6 md:left-auto md:right-6 md:top-auto md:mt-0 md:w-[400px] md:rounded-card">
        <div className="flex items-center justify-between border-b border-tomo-navy/10 px-4 py-3">
          <div>
            <p className="text-[15px] font-extrabold text-ink">{t(lang, "support.title")}</p>
            <p className="text-[11px] text-ink-soft">{t(lang, "support.sub")}</p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t(lang, "support.close")} className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-soft fine:hover:bg-tomo-navy/5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <SupportBot lang={lang} compact loggedIn={loggedIn} />
      </dialog>
    </>
  );
}
