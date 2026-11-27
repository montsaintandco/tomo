"use client";
// 해외 마켓 경매 입찰 신청 패널(M4, docs/aaa/15 6.1절). 상품 상세(메루카리 경매)에서 플래그 NEXT_PUBLIC_MARKET_AUCTION=1 일 때만 그린다.
// 금액은 서버(0050 market_bid_amount)와 같은 식(lib/market-bid.ts marketBidAmount)·같은 환율표 값으로 미리 보여 준다. 환율 가산 구성은 보이지 않는다.
// 신청 = POST /api/market-bid → 승인만 하는 Stripe 결제창(카드만). 결제 복귀는 /bids/[id].
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice } from "@/lib/currency";
import { marketBidAmount, minCapJpy } from "@/lib/market-bid";
import { timeLeftShort } from "@/lib/auction";
import type { Addr } from "@/components/AddressBook";

type Ship = { name: string; phone: string; postal: string; address: string; note: string };
export type MbPanelProps = {
  lang: Lang; source: string; sourceId: string; loginHref: string;
  info: { price: number; bids: number; endsAt: string };
  shipJpy: number | null;            // 출품자 부담 0, 모름 null(신청 불가)
  rate: number | null;               // exchange_rates JPY_KRW(DB 가 신청 때 고정하는 값과 같은 표)
  settings: { accepting: boolean; cap_max_jpy: number; min_lead_minutes: number; max_lead_hours: number; fee_jpy: number } | null;
  guest: boolean; country: string | null; addresses: Addr[]; mine: { id: string } | null; taken?: boolean; now: number;
};

export default function MarketBidPanel(p: MbPanelProps) {
  const { lang } = p;
  const left = new Date(p.info.endsAt).getTime() - p.now;
  const min = minCapJpy(p.info.price, p.info.bids);
  const first = p.addresses.find((a) => a.is_default) ?? p.addresses[0];
  const [cap, setCap] = useState(String(min));
  const [ship, setShip] = useState<Ship>(first ? { name: first.name, phone: first.phone, postal: first.postal, address: first.address, note: first.note } : { name: "", phone: "", postal: "", address: "", note: "" });
  const [addressId, setAddressId] = useState<string | null>(first?.id ?? null);
  const [pccc, setPccc] = useState(first?.pccc ?? "");
  const [agree, setAgree] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""));
  const capN = Number(cap);
  const amt = useMemo(() => (p.rate && Number.isInteger(capN) && capN > 0 && p.shipJpy != null
    ? marketBidAmount(capN, p.shipJpy, p.rate, p.settings?.fee_jpy ?? 0) : null), [capN, p.rate, p.shipJpy, p.settings?.fee_jpy]);
  const krw = (n: number) => formatPrice(n, "KRW", lang);
  const router = useRouter();

  const head = (
    <div className="mb-3 grid grid-cols-3 gap-2 text-center">
      <div><p className="text-[11px] text-ink-soft">{t(lang, "mb.panel.current")}</p><p className="tnum text-[15px] font-extrabold">{formatPrice(p.info.price, "JPY", lang)}</p></div>
      <div><p className="text-[11px] text-ink-soft">{t(lang, "mb.panel.bidCount")}</p><p className="tnum text-[13px] font-bold">{t(lang, "mb.panel.bids", { n: p.info.bids })}</p></div>
      <div><p className="text-[11px] text-ink-soft">{t(lang, "mb.panel.ends")}</p><p className={`tnum text-[13px] font-bold ${left < 6 * 36e5 ? "text-tomo-rose" : ""}`}>{t(lang, "mb.panel.left", { t: timeLeftShort(lang, left) })}</p></div>
    </div>
  );
  const box = (children: React.ReactNode) => (
    <section aria-label={t(lang, "mb.panel.title")} className="card p-4">
      <h2 className="mb-3 text-[15px] font-extrabold text-ink">{t(lang, "mb.panel.title")}</h2>
      {head}{children}
    </section>
  );
  const note = (key: Parameters<typeof t>[1]) => box(<p className="rounded-card bg-tomo-navy/5 p-3 text-[13px] text-ink-soft">{t(lang, key)}</p>);

  if (p.mine) return box(<Link href={`/bids/${p.mine.id}`} className="btn block bg-tomo-navy py-3 text-center text-sm text-white">{t(lang, "mb.panel.mine")}</Link>);
  if (!p.settings?.accepting) return note("mb.err.notAccepting");
  if (p.taken) return note("mb.err.taken");
  if (p.guest) return box(<Link href={p.loginHref} className="btn block bg-tomo-coral-deep py-3 text-center text-sm text-white">{t(lang, "mb.panel.login")}</Link>);
  if (p.country !== "KR") return note("mb.err.country");
  if (p.shipJpy == null) return note("mb.err.shipping");
  if (!p.rate) return note("mb.err.notReady");
  if (left < p.settings.min_lead_minutes * 60e3) return note("mb.err.endingSoon");
  if (left > p.settings.max_lead_hours * 36e5) return note("mb.err.tooEarly");

  const pick = (a: Addr | null) => {
    setAddressId(a?.id ?? null);
    setShip(a ? { name: a.name, phone: a.phone, postal: a.postal, address: a.address, note: a.note } : { name: "", phone: "", postal: "", address: "", note: "" });
    setPccc(a?.pccc ?? "");
  };
  const set = (k: keyof Ship) => (e: React.ChangeEvent<HTMLInputElement>) => setShip((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!Number.isInteger(capN) || capN < min) { setError(t(lang, "mb.err.capLow", { min })); return; }
    if (capN > p.settings!.cap_max_jpy) { setError(t(lang, "mb.err.capHigh", { max: p.settings!.cap_max_jpy })); return; }
    if (!agree.every(Boolean)) { setError(t(lang, "mb.panel.agreeNeeded")); return; }
    const code = pccc.trim().toUpperCase();
    if (!/^P[0-9]{12}$/.test(code)) { setError(t(lang, "mb.err.pccc")); return; }
    setBusy(true);
    const res = await fetch("/api/market-bid", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: p.source, sourceId: p.sourceId, capJpy: capN, requestId, seenPrice: p.info.price, ship: { ...ship, pccc: code }, addressId }) }).catch(() => null);
    const j = await res?.json().catch(() => ({})) ?? {};
    if (res?.ok && j.url) { window.location.assign(j.url); return; }
    if (res?.ok && j.bidId) { router.push(`/bids/${j.bidId}`); return; }
    setBusy(false);
    setError(j.error ?? t(lang, "mb.err.failed"));
  }

  const field = (k: keyof Ship, label: string, required = true) => (
    <label className="block text-[12px] font-bold text-ink">{label}
      <input value={ship[k]} onChange={set(k)} required={required} className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-normal shadow-soft" />
    </label>
  );
  return box(
    <form onSubmit={submit} className="flex flex-col gap-3"
      onInvalidCapture={(e) => { const d = e.currentTarget.querySelector("details"); if (d) d.open = true; }}>
      <label className="block text-[12px] font-bold text-ink">{t(lang, "mb.panel.cap")}
        <input inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, ""))} required
          className="tnum mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-bold shadow-soft" aria-describedby="mb-cap-hint" />
        <span id="mb-cap-hint" className="mt-1 block text-[11px] font-normal text-ink-soft">{t(lang, "mb.panel.capHint", { min, max: p.settings.cap_max_jpy })}</span>
      </label>
      {amt && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-card bg-tomo-navy/5 p-3 text-[12px]">
          <dt className="text-ink-soft">{t(lang, "mb.panel.item")} + {t(lang, "mb.panel.jpShip")}</dt><dd className="tnum text-right">{krw(amt.subtotal)}</dd>
          <dt className="text-ink-soft">{t(lang, "mb.panel.intl")}</dt><dd className="tnum text-right">{krw(amt.intl_shipping)}</dd>
          <dt className="text-ink-soft">{t(lang, "mb.panel.customs")}</dt><dd className="tnum text-right">{krw(amt.customs)}</dd>
          {amt.fee > 0 && <><dt className="text-ink-soft">{t(lang, "mb.panel.fee")}</dt><dd className="tnum text-right">{krw(amt.fee)}</dd></>}
          <dt className="font-extrabold text-ink">{t(lang, "mb.panel.max")}</dt><dd className="tnum text-right text-[15px] font-extrabold" data-testid="mb-max">{krw(amt.total)}</dd>
          <dd className="col-span-2 text-[11px] text-ink-soft">{t(lang, "mb.panel.rateNote")} · {t(lang, "mb.panel.jpShip")} {formatPrice(p.shipJpy, "JPY", lang)}</dd>
        </dl>
      )}
      <p className="text-[12px] text-ink-soft">{t(lang, "mb.panel.cardOnly")}</p>
      <p className="text-[12px] text-ink-soft">{t(lang, "mb.panel.rule")}</p>
      <p className="text-[11px] text-ink-soft">{t(lang, "mb.panel.manualNote")}</p>

      {/* 저장된 배송지가 있으면 한 줄 요약으로 접는다(390px 화면에서 패널이 너무 길어서). 빈 칸이 있으면 제출 때 펼친다(onInvalidCapture) */}
      <details open={!first} className="rounded-card bg-tomo-navy/5 px-3 py-2.5">
      <summary className="cursor-pointer text-[13px] font-extrabold text-ink">{t(lang, "mb.panel.ship")}
        {ship.name && <span className="ml-1.5 text-[12px] font-normal text-ink-soft">{ship.name} · {ship.address.slice(0, 18)}{ship.address.length > 18 ? "…" : ""}</span>}
      </summary>
      <fieldset className="mt-2 flex flex-col gap-2">
        {p.addresses.length > 0 && (
          <div role="radiogroup" className="flex flex-wrap gap-1.5">
            {p.addresses.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={addressId === a.id} onClick={() => pick(a)}
                className={`press rounded-full px-3 py-2 text-[12px] font-bold ${addressId === a.id ? "bg-tomo-navy text-white" : "bg-tomo-navy/5 text-ink"}`}>{a.label || a.name}</button>
            ))}
            <button type="button" role="radio" aria-checked={addressId === null} onClick={() => pick(null)}
              className={`press rounded-full px-3 py-2 text-[12px] font-bold ${addressId === null ? "bg-tomo-navy text-white" : "bg-tomo-navy/5 text-ink"}`}>{t(lang, "addr.new")}</button>
          </div>
        )}
        {field("name", t(lang, "order.name"))}
        {field("phone", t(lang, "order.phone"))}
        {field("postal", t(lang, "order.postal"))}
        {field("address", t(lang, "order.addressLine"))}
        {field("note", t(lang, "order.shipNote"), false)}
      </fieldset>
      </details>
      <label className="block text-[12px] font-bold text-ink">{t(lang, "addr.pccc")}
        <input value={pccc} onChange={(e) => setPccc(e.target.value)} required maxLength={13} autoComplete="off"
          className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-normal uppercase shadow-soft" />
        <span className="mt-1 block text-[11px] font-normal text-ink-soft">{t(lang, "addr.pcccHint")}</span>
      </label>

      <div className="flex flex-col gap-1.5">
        {(["mb.panel.agree1", "mb.panel.agree2", "mb.panel.agree3"] as const).map((k, i) => (
          <label key={k} className="flex items-start gap-2 text-[12px] text-ink">
            <input type="checkbox" checked={agree[i]} onChange={(e) => setAgree((a) => a.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5" />
            <span>{t(lang, k)}</span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-[12px] text-tomo-rose">{error}</p>}
      <button type="submit" disabled={busy || !requestId} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white disabled:opacity-50">
        {busy ? t(lang, "mb.panel.busy") : t(lang, "mb.panel.submit")}
      </button>
    </form>,
  );
}
