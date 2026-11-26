"use client";
import { useEffect, useRef, useState } from "react";

// 메루카리식 갤러리: 데스크톱은 좌측 세로 썸네일 + 큰 이미지, 모바일은 큰 이미지 + 아래 가로 썸네일.
// 메인 이미지는 네이티브 스크롤 스냅 — JS가 붙기 전에도 스와이프가 되고, 화살표·썸네일은 scrollTo로 같은 스트립을 움직인다.
// 현재 인덱스는 스크롤 위치에서 읽는다 (상태 하나, 상품이 바뀌면 부모가 key로 새로 만든다)
// 확대: 큰 이미지를 누르면 <dialog> 전체 화면(가로 스와이프). zoomLabel 이 없으면 확대를 끈다
export default function Gallery({ images, alt, lang, counter, prevLabel, nextLabel, zoomLabel, closeLabel }: {
  images: string[]; alt: string; lang?: string; counter: string; prevLabel: string; nextLabel: string; zoomLabel?: string; closeLabel?: string;
}) {
  const [i, setI] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDialogElement>(null);
  const zoomStrip = useRef<HTMLDivElement>(null);
  const openZoom = () => {
    zoom.current?.showModal();
    const el = zoomStrip.current;
    if (el) el.scrollLeft = i * el.clientWidth;
  };
  const n = images.length;

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setI(Math.round(el.scrollLeft / el.clientWidth)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  const to = (k: number) => {
    const el = strip.current;
    if (!el) return;
    const idx = (k + n) % n;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    setI(idx);
  };
  const arrow = "press absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-tomo-navy shadow-soft";

  return (
    <div className="flex flex-col md:flex-row md:gap-3">
      {n > 1 && (
        <ul className="order-1 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:order-none md:w-16 md:shrink-0 md:flex-col md:px-0 md:py-0" aria-label={counter}>
          {images.map((src, k) => (
            <li key={k} className="shrink-0">
              <button type="button" onClick={() => to(k)} aria-label={`${k + 1}/${n}`} aria-current={k === i}
                className={`press block h-14 w-14 overflow-hidden rounded-thumb md:h-16 md:w-16 ${k === i ? "ring-2 ring-tomo-navy" : "opacity-70 hover:opacity-100"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative min-w-0 flex-1 bg-tomo-navy/5 md:overflow-hidden md:rounded-card">
        <div ref={strip} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((src, k) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={k} src={src} alt={k === 0 ? alt : ""} lang={k === 0 ? lang : undefined}
              onClick={zoomLabel ? openZoom : undefined}
              className={`aspect-square w-full shrink-0 snap-center object-contain ${zoomLabel ? "cursor-zoom-in" : ""}`} loading={k === 0 ? "eager" : "lazy"} />
          ))}
        </div>
        {zoomLabel && (
          <button type="button" onClick={openZoom} aria-label={zoomLabel}
            className="press absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-tomo-navy shadow-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" /></svg>
          </button>
        )}
        {n > 1 && (
          <>
            <button type="button" onClick={() => to(i - 1)} aria-label={prevLabel} className={`${arrow} left-3`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" onClick={() => to(i + 1)} aria-label={nextLabel} className={`${arrow} right-3`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
            </button>
            <span className="tnum absolute bottom-3 right-3 rounded-full bg-tomo-navy/75 px-2.5 py-1 text-[11px] font-bold text-white" aria-live="polite">
              {i + 1} / {n}
            </span>
          </>
        )}
      </div>
      {zoomLabel && (
        <dialog ref={zoom} aria-label={zoomLabel} onClick={(e) => { if (e.target === e.currentTarget) zoom.current?.close(); }}
          className="m-0 h-full max-h-none w-full max-w-none bg-black/95 p-0 backdrop:bg-black/80">
          <div ref={zoomStrip} className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {images.map((src, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={src} alt="" className="h-full w-full shrink-0 snap-center object-contain" loading="lazy" />
            ))}
          </div>
          <button type="button" onClick={() => zoom.current?.close()} aria-label={closeLabel ?? "×"}
            className="press absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-tomo-navy">✕</button>
        </dialog>
      )}
    </div>
  );
}
