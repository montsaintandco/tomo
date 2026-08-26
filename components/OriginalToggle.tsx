"use client";
import { useState } from "react";

export default function OriginalToggle(props: {
  translatedTitle: string; translatedDesc: string;
  originalTitle: string; originalDesc: string;
  needsTranslation: boolean; hasTranslation: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(!props.hasTranslation);
  const title = showOriginal ? props.originalTitle : props.translatedTitle;
  const desc = showOriginal ? props.originalDesc : props.translatedDesc;
  return (
    <div>
      <h1 className="text-lg font-bold text-ink">{title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{desc}</p>
      {props.needsTranslation && props.hasTranslation && (
        <button className="press mt-2.5 rounded-full bg-tomo-blue/20 px-3 py-1 text-xs font-bold text-tomo-navy"
          onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? "번역 보기 · 翻訳を見る" : "원문 보기 · 原文を見る"}
        </button>
      )}
      {props.needsTranslation && !props.hasTranslation && (
        <p className="mt-2 text-xs text-ink-faint">번역 준비 중 · 翻訳準備中</p>
      )}
    </div>
  );
}
