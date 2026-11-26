"use client";
import { useEffect } from "react";
import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice } from "@/lib/currency";
import type { RecheckChange } from "@/lib/price-check";
import type { ProxyOrderTotal } from "@/lib/fees";

// 결제 직전 재확인 결과(/api/order 409). 결제는 아직 안 됐다.
// 오름·내림만 있으면 새 합계를 보여 주고 「바뀐 가격으로 결제하기」를 받는다(onAgree).
// 품절·확인 불가가 있으면 진행 버튼 없이 장바구니로 보낸다. onAgree 가 없으면(재결제) 안내만 한다.
export default function PriceChangedDialog({ lang, changes, newTotal, onAgree, onClose, hint }: {
  lang: Lang; changes: RecheckChange[]; newTotal?: ProxyOrderTotal | null;
  onAgree?: () => void; onClose: () => void; hint?: string;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const hard = changes.some((c) => c.kind === "sold" || c.kind === "unverified");
  const label = (c: RecheckChange) => c.kind === "sold" ? t(lang, "pay.recheck.sold")
    : c.kind === "unverified" ? t(lang, "pay.recheck.unverified") : t(lang, "pay.recheck.up");
  const shown = changes.filter((c) => c.kind !== "down" || !hard); // 막힌 경우엔 내림 줄은 빼고 막힌 이유만

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="pcd-title" onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-md p-5">
        <h2 id="pcd-title" className="text-[16px] font-extrabold text-ink">{t(lang, "pay.recheck.title")}</h2>
        <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "pay.recheck.lead")}</p>
        <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {shown.map((c) => (
            <li key={c.id} className="rounded-card bg-tomo-navy/5 p-3 text-[13px]">
              <p className="line-clamp-1 font-bold text-ink">{c.title}</p>
              <p className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
                <span className={c.kind === "down" ? "text-ink-soft" : "text-tomo-rose"}>{c.kind === "down" ? "" : label(c)}</span>
                {(c.kind === "up" || c.kind === "down") && (
                  <span className="tnum text-ink"><s className="text-ink-soft">{formatPrice(c.from, c.currency, lang)}</s> → <b>{formatPrice(c.to, c.currency, lang)}</b></span>
                )}
              </p>
            </li>
          ))}
        </ul>
        {!hard && onAgree && newTotal && (
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-3 text-[13px]">
            <span className="font-bold text-ink">{t(lang, "pay.recheck.newTotal")}</span>
            <span className="tnum text-[17px] font-extrabold text-tomo-navy">{formatPrice(newTotal.total, newTotal.currency, lang)}</span>
          </p>
        )}
        {(hard || !onAgree) && <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">{hint ?? t(lang, "pay.recheck.blockedHint")}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {!hard && onAgree
            ? <button type="button" onClick={onAgree} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">{t(lang, "pay.recheck.agree")}</button>
            : <Link href="/cart" className="btn block w-full bg-tomo-coral-deep py-3 text-center text-sm text-white">{t(lang, "pay.recheck.toCart")}</Link>}
          <button type="button" onClick={onClose} className="press min-h-11 w-full text-[13px] font-bold text-ink-soft">{t(lang, "pay.recheck.close")}</button>
        </div>
      </div>
    </div>
  );
}
