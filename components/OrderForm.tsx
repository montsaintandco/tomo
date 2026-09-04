"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import type { ProxyOrderTotal } from "@/lib/fees";
import OrderSummary from "@/components/OrderSummary";
import type { CartRow } from "@/components/CartList";
import { formatPrice, convertPrice } from "@/lib/currency";

type Ship = { name: string; phone: string; postal: string; address: string; note: string };
const METHODS_KRW = ["card", "kakao_pay", "naver_pay"] as const;
const METHODS_JPY = ["card"] as const;

// react-hooks/static-components: OrderForm 내부가 아닌 모듈 스코프에 정의, ship/onChange는 props로 전달
function Field({ k, label, value, onChange, type = "text", required = true }: {
  k: keyof Ship; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; required?: boolean;
}) {
  return (
    <label className="block text-[12px] font-bold text-ink">{label}
      <input type={type} value={value} onChange={onChange} required={required} autoComplete={k === "name" ? "name" : k === "phone" ? "tel" : k === "postal" ? "postal-code" : "street-address"}
        className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-normal shadow-soft placeholder:text-ink-soft" />
    </label>
  );
}

export default function OrderForm({ lang, rows, totals, rate, initialShip }: {
  lang: Lang; rows: CartRow[]; totals: ProxyOrderTotal; rate: number; initialShip: Ship;
}) {
  const [ship, setShip] = useState<Ship>(initialShip);
  const [method, setMethod] = useState<string>("card");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const methods = totals.currency === "KRW" ? METHODS_KRW : METHODS_JPY;
  const set = (k: keyof Ship) => (e: React.ChangeEvent<HTMLInputElement>) => setShip((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(""); setError("");
    const res = await fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: rows.map((r) => r.id), method, ship }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) { setMsg(t(lang, "order.pending")); setBusy(false); return; }
    if (res.status === 401) { setError(t(lang, "order.fail")); setBusy(false); return; }
    if (!res.ok) { setError(json.error || t(lang, "order.fail")); setBusy(false); return; }
    window.location.href = json.url;
  }

  return (
    <form id="order-form" onSubmit={submit} className="md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-6">
      <div className="flex flex-col gap-4">
        {/* 주문 상품 (접이식) */}
        <section className="card p-4">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between text-[15px] font-extrabold text-ink">
            {t(lang, "order.items", { n: rows.length })}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {open && (
            <ul className="mt-2 flex flex-col gap-2">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 text-[13px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.image && <img src={r.image} alt="" className="h-10 w-10 rounded-thumb object-cover" />}
                  <span className="line-clamp-1 flex-1 text-ink">{r.title}</span>
                  <span className="tnum font-bold text-ink">{formatPrice(r.currency === totals.currency ? r.price : convertPrice(r.price, r.currency, rate), totals.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-[15px] font-extrabold text-ink">{t(lang, "order.address")}</h2>
          <Field k="name" label={t(lang, "order.name")} value={ship.name} onChange={set("name")} />
          <Field k="phone" label={t(lang, "order.phone")} type="tel" value={ship.phone} onChange={set("phone")} />
          <Field k="postal" label={t(lang, "order.postal")} value={ship.postal} onChange={set("postal")} />
          <Field k="address" label={t(lang, "order.addressLine")} value={ship.address} onChange={set("address")} />
          <Field k="note" label={t(lang, "order.shipNote")} required={false} value={ship.note} onChange={set("note")} />
        </section>

        <section className="rounded-card bg-tomo-navy/5 p-4 text-[12px] text-ink-soft">
          <p className="font-bold text-ink">{t(lang, "order.shipInfo")}</p>
          <p className="mt-1">{t(lang, "order.shipEta")}</p>
          <p className="mt-3 font-bold text-ink">{t(lang, "order.customs")}</p>
          <p className="mt-1">{t(lang, "ext.customsNote")}</p>
        </section>

        <fieldset className="card p-4">
          <legend className="sr-only">{t(lang, "order.payMethod")}</legend>
          <h2 className="text-[15px] font-extrabold text-ink">{t(lang, "order.payMethod")}</h2>
          <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "order.payHint")}</p>
          <div className={`mt-3 grid gap-2 ${methods.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
            {methods.map((m) => (
              <label key={m} className={`flex min-h-14 cursor-pointer items-center justify-center rounded-card border-[1.5px] text-[13px] font-bold ${
                method === m ? "border-tomo-coral-deep bg-tomo-coral-deep/5 text-tomo-coral-deep" : "border-tomo-navy/15 text-ink"}`}>
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                {t(lang, `pay.${m}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {msg && <p className="text-center text-xs text-ink-soft">{msg}</p>}
        {error && <p role="alert" className="text-center text-xs text-tomo-rose">{error}</p>}
        <p className="text-[11px] text-ink-soft">{t(lang, "order.agree")}</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tomo-navy/5 bg-white p-3 standalone:bottom-16 md:static md:border-0 md:bg-transparent md:p-0 md:sticky md:top-24">
        <OrderSummary lang={lang} totals={totals} cta={{ label: busy ? t(lang, "order.paying") : t(lang, "order.checkout"), busy, onClick: () => (document.getElementById("order-form") as HTMLFormElement)?.requestSubmit() }} />
      </div>
    </form>
  );
}
