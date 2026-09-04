"use client";
import { useRef } from "react";
import { t, type Lang } from "@/lib/i18n";

// 결제 비용 안내 — "받으실 때 추가 청구 없음" 옆 ? 버튼 → 네이티브 <dialog>. 사줘의 비용 안내 모달과 같은 4항목
export default function CostInfo({ lang }: { lang: Lang }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-label={t(lang, "order.costTitle")}
        className="press ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-ink-soft/50 text-[11px] font-bold text-ink-soft align-middle">?</button>
      <dialog ref={ref} aria-labelledby="cost-title"
        className="m-0 mt-auto w-full max-w-md rounded-t-card bg-white p-0 shadow-lift backdrop:bg-tomo-navy/40 md:m-auto md:rounded-card">
        <div className="flex flex-col gap-4 p-5 text-left">
          <div className="flex items-center justify-between">
            <h2 id="cost-title" className="text-[17px] font-extrabold text-ink">{t(lang, "order.costTitle")}</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label={t(lang, "ext.cancel")} className="press flex h-9 w-9 items-center justify-center rounded-full text-ink-soft">✕</button>
          </div>
          <section>
            <h3 className="text-[15px] font-bold text-ink">{t(lang, "order.cost1")}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{t(lang, "order.cost1Body")}</p>
          </section>
          <section>
            <h3 className="text-[15px] font-bold text-ink">{t(lang, "order.costItems")}</h3>
            <ul className="mt-1 list-disc pl-5 text-[13px] leading-relaxed text-ink-soft">
              {(["order.costI1", "order.costI2", "order.costI3", "order.costI4"] as const).map((k) => <li key={k}>{t(lang, k)}</li>)}
            </ul>
          </section>
          <section>
            <h3 className="text-[15px] font-bold text-ink">{t(lang, "order.cost2")}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{t(lang, "order.cost2Body")}</p>
          </section>
        </div>
      </dialog>
    </>
  );
}
