import { t, type Lang } from "@/lib/i18n";
import { formatPrice, convertPrice } from "@/lib/currency";
import type { ProxyOrderTotal } from "@/lib/fees";
import CostInfo from "@/components/CostInfo";
import type { DirectDetailTotal } from "./total";

function Line({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-ink-soft">{k}{sub && <span className="block text-[11px]">{sub}</span>}</span>
      <span className="tnum shrink-0 text-right text-ink">{v}</span>
    </div>
  );
}

// 해외 대행 상세 총액 — 숫자는 components/detail/total.ts(주문서와 같은 함수)에서 받기만 한다
export function ProxyTotalBox({ lang, totals, original, shippingIncluded }: {
  lang: Lang; totals: ProxyOrderTotal; original?: string; shippingIncluded?: boolean;
}) {
  const f = (n: number) => formatPrice(n, totals.currency, lang);
  return (
    <section aria-label={t(lang, "detail.totalTitle")} className="rounded-card border border-tomo-navy/10 p-3.5 text-[13px]">
      <Line k={t(lang, "detail.itemPrice")} v={original ? `${f(totals.subtotal)} (${original})` : f(totals.subtotal)} />
      <Line k={t(lang, "detail.localShip")} v={t(lang, shippingIncluded === false ? "detail.localShipBuyer" : "detail.localShipSeller")} />
      <Line k={t(lang, "order.intlShipping")} sub={t(lang, "detail.perOrder")} v={f(totals.intlShipping)} />
      <Line k={t(lang, "order.customsLine")} v={f(totals.customs)} />
      <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
        <span className="font-bold text-ink">{t(lang, "detail.totalTitle")}</span>
        <span className="tnum text-[17px] font-extrabold text-tomo-navy">{f(totals.total)}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{t(lang, "detail.totalNote")}<CostInfo lang={lang} /></p>
    </section>
  );
}

// 국경 간 직거래(택배) 총액 — 결제(app/api/checkout)와 같은 directShippingFee. 거래 통화 금액이 기준, 구매자 통화는 참고
export function DirectTotalBox({ lang, totals, viewerCurrency, rate, toJapan }: {
  lang: Lang; totals: DirectDetailTotal; viewerCurrency: "KRW" | "JPY"; rate: number;
  /** 한국 상품 → 일본(통관 예치금·세금 안내) */
  toJapan?: boolean;
}) {
  const f = (n: number) => formatPrice(n, totals.currency, lang);
  const approx = totals.currency !== viewerCurrency
    ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(totals.total, totals.currency, rate), viewerCurrency, lang)}` : "";
  return (
    <section aria-label={t(lang, "detail.directTotalTitle")} className="rounded-card border border-tomo-navy/10 p-3.5 text-[13px]">
      <Line k={t(lang, "detail.itemPrice")} v={f(totals.item)} />
      <Line k={t(lang, "order.intlShipping")} v={f(totals.intlShipping)} />
      {totals.customsDeposit > 0 && <Line k={t(lang, "customs.depositLine")} v={f(totals.customsDeposit)} />}
      <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
        <span className="font-bold text-ink">{t(lang, "detail.directTotalTitle")}</span>
        <span className="text-right">
          <span className="tnum block text-[17px] font-extrabold text-tomo-navy">{f(totals.total)}</span>
          {approx && <span className="tnum block text-[11px] text-ink-soft">{approx}</span>}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{t(lang, "detail.directTotalNote")}</p>
      {toJapan && (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
          {t(lang, totals.customsDeposit > 0 ? "customs.depositNote" : "customs.smallNote")}
        </p>
      )}
    </section>
  );
}
