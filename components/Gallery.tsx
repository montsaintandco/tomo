"use client";
import { useState } from "react";

// 메루카리식 갤러리: 데스크톱은 좌측 세로 썸네일 + 큰 이미지, 모바일은 큰 이미지 + 아래 가로 썸네일.
// 상태는 인덱스 하나. 스와이프 라이브러리 없음 — 썸네일 탭·화살표·키보드로 충분
export default function Gallery({ images, alt, lang, counter, prevLabel, nextLabel }: {
  images: string[]; alt: string; lang?: string; counter: string; prevLabel: string; nextLabel: string;
}) {
  const [i, setI] = useState(0);
  const n = images.length;
  const go = (d: number) => setI((c) => (c + d + n) % n);
  const arrow = "press absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-tomo-navy shadow-soft backdrop-blur-sm";

  return (
    <div className="flex flex-col md:flex-row md:gap-3">
      {n > 1 && (
        <ul className="order-1 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:order-none md:w-16 md:shrink-0 md:flex-col md:px-0 md:py-0" aria-label={counter}>
          {images.map((src, k) => (
            <li key={k} className="shrink-0">
              <button type="button" onClick={() => setI(k)} aria-label={`${k + 1}/${n}`} aria-current={k === i}
                className={`press block h-14 w-14 overflow-hidden rounded-thumb md:h-16 md:w-16 ${k === i ? "ring-2 ring-tomo-navy" : "opacity-70 hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative min-w-0 flex-1 bg-tomo-navy/5 md:overflow-hidden md:rounded-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[i]} alt={alt} lang={lang} className="aspect-square w-full object-contain" loading="eager" />
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={prevLabel} className={`${arrow} left-3`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" onClick={() => go(1)} aria-label={nextLabel} className={`${arrow} right-3`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
            </button>
            <span className="tnum absolute bottom-3 right-3 rounded-full bg-tomo-navy/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm" aria-live="polite">
              {i + 1} / {n}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
