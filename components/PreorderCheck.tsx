"use client";
import { useRef } from "react";
import { t, type Lang } from "@/lib/i18n";

// "잠깐! 주문 전 3가지만 확인해주세요" — 사줘의 결제 전 분쟁 차단 장치. 노란 띠 + 자세히 → <dialog>
export default function PreorderCheck({ lang }: { lang: Lang }) {
  const ref = useRef<HTMLDialogElement>(null);
  const items = [["ext.check1", "ext.check1Body"], ["ext.check2", "ext.check2Body"], ["ext.check3", "ext.check3Body"]] as const;
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}
        className="press flex w-full items-center justify-between gap-3 rounded-card bg-tomo-ivory px-3.5 py-3 text-left text-[13px] font-bold text-ink">
        <span>⚠️ {t(lang, "ext.checkTitle")}</span>
        <span className="shrink-0 text-[12px] text-tomo-navy underline">{t(lang, "ext.checkMore")}</span>
      </button>
      <dialog ref={ref} aria-labelledby="check-title"
        className="m-0 mt-auto w-full max-w-md rounded-t-card bg-white p-0 shadow-lift backdrop:bg-tomo-navy/40 md:m-auto md:rounded-card">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 id="check-title" className="text-[17px] font-extrabold text-ink">{t(lang, "ext.checkTitle")}</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label={t(lang, "ext.cancel")} className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-soft">✕</button>
          </div>
          {items.map(([h, b]) => (
            <section key={h}>
              <h3 className="text-[15px] font-bold text-ink">{t(lang, h)}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{t(lang, b)}</p>
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}
