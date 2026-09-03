"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";

// 공유 — 네이티브 공유 시트가 있으면 그걸로, 없으면 링크 복사
export default function ShareButton({ title, lang }: { title: string; lang: Lang }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" onClick={share}
      className="press inline-flex items-center gap-1.5 rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[13px] font-bold text-tomo-navy">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M12 15V4M8 7.5 12 3.5l4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
      </svg>
      <span aria-live="polite">{copied ? t(lang, "detail.shareCopied") : t(lang, "detail.share")}</span>
    </button>
  );
}
