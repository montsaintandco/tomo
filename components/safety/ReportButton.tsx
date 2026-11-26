"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import ReportSheet, { type ReportTarget } from "./ReportSheet";

// 신고 버튼 — 비로그인이면 로그인으로 보낸다. 44px 터치 영역의 작은 글자 버튼
export default function ReportButton({ targetType, targetId, lang, guest = false, next }: {
  targetType: ReportTarget; targetId: string; lang: Lang; guest?: boolean; next?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" aria-label={t(lang, `trust.report.${targetType}`)}
        onClick={() => (guest ? router.push(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`) : setOpen(true))}
        className="press inline-flex min-h-11 items-center gap-1 px-2 text-[12px] text-ink-soft underline-offset-2 hover:underline">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
        </svg>
        {t(lang, "trust.report")}
      </button>
      {open && <ReportSheet targetType={targetType} targetId={targetId} lang={lang} onClose={() => setOpen(false)} />}
    </>
  );
}
