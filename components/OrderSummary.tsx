import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice } from "@/lib/currency";
import type { ProxyOrderTotal } from "@/lib/fees";

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-[13px]"><span className="text-ink-soft">{k}</span><span className="tnum text-ink">{v}</span></div>
  );
}

export default function OrderSummary({ lang, totals, cta }: {
  lang: Lang; totals: ProxyOrderTotal;
  cta?: { label: string; href?: string; onClick?: () => void; disabled?: boolean; busy?: boolean };
}) {
  const f = (n: number) => formatPrice(n, totals.currency);
  return (
    <section aria-label={t(lang, "order.summary")} className="card flex flex-col gap-1.5 p-4">
      <h2 className="mb-1 text-[15px] font-extrabold text-ink">{t(lang, "order.summary")}</h2>
      <Line k={t(lang, "order.subtotal")} v={f(totals.subtotal)} />
      <Line k={t(lang, "order.intlShipping")} v={f(totals.intlShipping)} />
      <Line k={t(lang, "order.serviceFee")} v={f(totals.serviceFee)} />
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2.5">
        <span className="text-[13px] font-bold text-ink">{t(lang, "order.total")}</span>
        <span className="tnum text-[17px] font-extrabold text-tomo-navy">{f(totals.total)}</span>
      </div>
      <p className="text-right text-[11px] text-ink-soft">{t(lang, "order.noExtra")}</p>
      {cta && (cta.href ? (
        <Link href={cta.href} aria-disabled={cta.disabled} className={`btn mt-2 block bg-tomo-coral-deep py-3 text-center text-sm text-white ${cta.disabled ? "pointer-events-none opacity-45" : ""}`}>{cta.label}</Link>
      ) : (
        <button type="button" onClick={cta.onClick} disabled={cta.disabled || cta.busy} className="btn mt-2 w-full bg-tomo-coral-deep py-3 text-sm text-white">{cta.label}</button>
      ))}
    </section>
  );
}
