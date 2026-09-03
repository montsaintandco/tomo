"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";

// 제목·설명의 번역/원문 토글 — 번역은 원문을 대체하지 않는다 (원문은 항상 한 탭 거리)
export default function OriginalToggle(props: {
  translatedTitle: string; translatedDesc: string;
  originalTitle: string; originalDesc: string;
  originalLang: Lang; needsTranslation: boolean; hasTranslation: boolean; lang: Lang;
}) {
  const [showOriginal, setShowOriginal] = useState(!props.hasTranslation);
  const title = showOriginal ? props.originalTitle : props.translatedTitle;
  const desc = showOriginal ? props.originalDesc : props.translatedDesc;
  const shownLang = showOriginal ? props.originalLang : props.lang;
  return (
    <div lang={shownLang}>
      <h1 className="text-[17px] font-bold leading-snug text-ink">{title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{desc}</p>
      {props.needsTranslation && props.hasTranslation && (
        <button type="button" aria-pressed={showOriginal}
          className="press mt-2.5 rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[13px] font-bold text-tomo-navy"
          onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? t(props.lang, "detail.viewTranslation") : t(props.lang, "detail.viewOriginal")}
        </button>
      )}
      {props.needsTranslation && !props.hasTranslation && (
        <p className="mt-2 text-xs text-ink-faint">{t(props.lang, "detail.translationPending")}</p>
      )}
    </div>
  );
}
