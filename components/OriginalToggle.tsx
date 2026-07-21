"use client";
import { useState } from "react";

export default function OriginalToggle(props: {
  translatedTitle: string; translatedDesc: string;
  originalTitle: string; originalDesc: string; hasTranslation: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(!props.hasTranslation);
  const title = showOriginal ? props.originalTitle : props.translatedTitle;
  const desc = showOriginal ? props.originalDesc : props.translatedDesc;
  return (
    <div>
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{desc}</p>
      {props.hasTranslation ? (
        <button className="mt-2 text-xs font-bold text-tomo-navy underline"
          onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? "번역 보기 · 翻訳を見る" : "원문 보기 · 原文を見る"}
        </button>
      ) : (
        <p className="mt-2 text-xs text-gray-400">번역 준비 중 · 翻訳準備中</p>
      )}
    </div>
  );
}
