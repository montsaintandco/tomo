"use client";
// 상품 상세의 경매 패널(U3) — 현재가·카운트다운·입찰 창·내 상태·입찰 기록·낙찰 결제·판매자 조치.
// 정본은 GET /api/auctions/[id]/state(0046 auction_state). 폴링 간격은 pollMs(5초, 마감 5분 전 2초, 끝나면 멈춤), 탭이 가려지면 멈춘다.
// 카운트다운은 server_now 와 내 시계 차이(clockSkew)로 서버 시각 기준. 금액 계산은 lib/auction·components/detail/total 만 쓴다.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AUCTION_RULES, amountOk, clockSkew, countdownText, ENDING_SOON_MS, increment, needsBigConfirm, pollMs,
  sellerCanRelist, viewerPhase, type AuctionState,
} from "@/lib/auction";
import { directDetailTotal, type DirectQuote } from "@/components/detail/total";
import { convertPrice, formatPrice } from "@/lib/currency";
import { t, type I18nKey, type Lang } from "@/lib/i18n";

type Props = {
  initial: AuctionState; lang: Lang; listingStatus: string;
  /** 보는 사람 나라 ≠ 상품 나라 — 국제배송비가 붙는다(결제 때 start_auction_transaction 과 같은 판정) */
  foreign: boolean;
  /** 상품이 국제 거래를 껐고 보는 사람이 다른 나라 */
  countryBlocked: boolean;
  /** 0057 listing_quote — 국제배송비(무게 구간)·통관 예치금 기준가. 결제(start_auction_transaction)와 같은 표 */
  quote?: DirectQuote | null;
  viewerCurrency: "KRW" | "JPY"; rate: number; guest: boolean; suspended: boolean;
};
type Msg = { text: string; err?: boolean } | null;

const fmtAt = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(lang === "ja" ? "ja-JP" : "ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  });

export default function AuctionPanel({ initial, lang, listingStatus, foreign, countryBlocked, quote, viewerCurrency, rate, guest, suspended }: Props) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState<number | null>(null); // 마운트 전에는 시각을 그리지 않는다(서버·브라우저 렌더 일치)
  const [announce, setAnnounce] = useState("");
  const cur = s.currency;
  const unit = AUCTION_RULES.unit[cur];
  const f = useCallback((n: number) => formatPrice(n, cur, lang), [cur, lang]);
  const floorOf = (x: AuctionState) => (x.viewer.leading && x.viewer.my_max != null ? x.viewer.my_max + unit : x.min_bid);

  const [amount, setAmount] = useState(String(floorOf(initial)));
  const edited = useRef(false);
  const prev = useRef(initial);
  const [step, setStep] = useState<"form" | "confirm" | "big">("form");
  const [rid, setRid] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [convertPriceIn, setConvertPriceIn] = useState(String(initial.final_price ?? initial.current_price));
  const confirmRef = useRef<HTMLDivElement>(null);

  // 새 상태 반영 — 현재가가 바뀌었거나 끝났을 때만 화면 읽기 프로그램에 알린다(초마다 읽지 않게)
  const apply = useCallback((next: AuctionState, receivedAt: number) => {
    setSkew(clockSkew(next.server_now, receivedAt));
    const p = prev.current;
    if (next.current_price !== p.current_price && next.bid_count > 0) setAnnounce(t(lang, "auction.ann.price", { price: f(next.current_price) }));
    else if (p.status === "live" && next.status !== "live") setAnnounce(t(lang, "auction.ann.ended"));
    if (!edited.current) setAmount(String(next.viewer.leading && next.viewer.my_max != null ? next.viewer.my_max + AUCTION_RULES.unit[next.currency] : next.min_bid));
    prev.current = next;
    setS(next);
  }, [lang, f]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/auctions/${s.listing_id}/state`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.state) apply(j.state as AuctionState, Date.now());
    } catch { /* 다음 차례에 다시 */ }
  }, [s.listing_id, apply]);

  // 1초 시계 + 마운트 직후 한 번 새로 받아 시계 차이를 맞춘다
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    Promise.resolve().then(() => { setNow(Date.now()); return refresh(); });
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 폴링 — 상태가 바뀔 때마다 다음 차례를 다시 잡는다. 가려진 탭은 건너뛰고, 다시 보이면 바로 받는다
  useEffect(() => {
    const ms = pollMs(s);
    if (ms == null) return;
    const tick = () => { if (!document.hidden) void refresh(); };
    const timer = setTimeout(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", tick); };
  }, [s, refresh]);

  useEffect(() => { if (step !== "form") confirmRef.current?.focus(); }, [step]);

  const phase = viewerPhase(s);
  const live = s.status === "live";
  const left = now == null ? null : new Date(s.ends_at).getTime() - (now + skew);
  const payLeft = now == null || !s.pay_due_at ? null : new Date(s.pay_due_at).getTime() - (now + skew);
  const floor = floorOf(s);
  const n = Number(amount);
  const valid = Number.isInteger(n) && amountOk(cur, n) && n >= floor;
  const total = directDetailTotal(valid ? n : floor, cur, foreign, quote);
  const banned = s.viewer.bid_banned_until;
  const bannedDate = banned && !Number.isNaN(new Date(banned).getTime()) ? fmtAt(banned, lang) : null;

  // 입찰할 수 없는 이유(있으면 입찰 창 대신 이 문구)
  const blockKey: I18nKey | null = !live ? null : phase === "seller" ? "auction.me.seller" : suspended ? "auction.err.suspended"
    : banned && !bannedDate ? "auction.err.restricted" : countryBlocked ? "auction.err.country" : null;

  async function post(path: string, body?: unknown) {
    const res = await fetch(`/api/auctions/${s.id}/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    return { res, j };
  }

  function review() {
    setMsg(null);
    if (!valid) {
      setMsg({ text: t(lang, Number.isInteger(n) && n > 0 && n < floor ? "auction.err.tooLow" : "auction.err.amount"), err: true });
      return;
    }
    setRid(crypto.randomUUID());
    setStep("confirm");
  }

  async function bid() {
    if (step === "confirm" && needsBigConfirm(n, s.current_price)) { setStep("big"); return; }
    setBusy("bid"); setMsg(null);
    try {
      const { res, j } = await post("bid", { amount: n, requestId: rid });
      if (!res.ok) {
        setMsg({ text: j.error || t(lang, "auction.err.generic"), err: true });
        setStep("form");
        if (res.status === 409) void refresh();
        return;
      }
      edited.current = false;
      if (j.state) apply(j.state as AuctionState, Date.now());
      setMsg({ text: t(lang, j.result?.leading ? "auction.bidLeading" : "auction.bidBehind") });
      setStep("form");
    } catch {
      setMsg({ text: t(lang, "auction.err.generic"), err: true }); // 같은 요청 번호로 다시 누르면 처음 결과를 돌려받는다
    } finally {
      setBusy(null);
    }
  }

  async function seller(action: "cancel" | "relist" | "convert") {
    setBusy(action); setMsg(null);
    try {
      const { res, j } = await post(action, action === "convert" ? { price: Number(convertPriceIn) } : undefined);
      if (!res.ok) { setMsg({ text: j.error || t(lang, "auction.err.generic"), err: true }); return; }
      setCancelAsk(false);
      await refresh();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function pay() {
    setBusy("pay"); setMsg(null);
    try {
      const { res, j } = await post("pay");
      if (res.status === 503) { setMsg({ text: t(lang, "detail.checkoutPending") }); return; }
      if (res.ok && j.url) { window.location.href = j.url; return; }
      if (res.ok && j.transactionId) { router.push(`/transactions/${j.transactionId}`); return; }
      setMsg({ text: j.error || t(lang, "detail.checkoutFail"), err: true });
    } finally {
      setBusy(null);
    }
  }

  const approx = (v: number) => (cur !== viewerCurrency ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(v, cur, rate), viewerCurrency, lang)}` : "");
  const me = phase === "leading" ? t(lang, "auction.me.leading", { max: f(s.viewer.my_max ?? 0) })
    : phase === "outbid" ? t(lang, "auction.me.outbid", { max: f(s.viewer.my_max ?? 0) })
    : phase === "won" ? t(lang, "auction.me.won") : phase === "lost" ? t(lang, "auction.me.lost") : null;

  return (
    <section aria-labelledby="auction-title" className="card p-3.5 md:p-5">
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announce}</p>
      <div className="flex items-center justify-between gap-3">
        <h2 id="auction-title" className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
          <span className="rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-bold text-white">{t(lang, "auction.badge")}</span>{" "}
          {t(lang, `auction.st.${s.status}`)}
        </h2>
        {live && (
          <span className="text-right">
            <span className="block text-[11px] text-ink-faint">{t(lang, "auction.remaining")}</span>
            <span role="timer" aria-live="off" className={`tnum block text-[15px] font-extrabold ${left != null && left <= ENDING_SOON_MS ? "text-tomo-rose" : "text-ink"}`}>
              {left == null ? "—" : countdownText(lang, left)}
            </span>
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[12px] text-ink-soft">{t(lang, s.final_price != null ? "auction.final" : "auction.current")}</p>
        <p className="tnum text-[22px] font-extrabold leading-tight text-ink">{f(s.final_price ?? s.current_price)}</p>
        {approx(s.final_price ?? s.current_price) && <p className="tnum text-[12px] text-ink-soft">{approx(s.final_price ?? s.current_price)}</p>}
        <p className="tnum mt-1 text-[12px] text-ink-soft">
          {t(lang, "auction.bids", { n: s.bid_count })} · {t(lang, "auction.startPrice", { price: f(s.start_price) })} · {t(lang, "auction.endsAt", { at: fmtAt(s.ends_at, lang) })}
        </p>
        {s.extended_count > 0 && <p className="mt-1 text-[12px] font-bold text-ink">{t(lang, "auction.extended", { n: s.extended_count })}</p>}
        {live && <p className="mt-0.5 text-[11px] text-ink-faint">{t(lang, "auction.extendRule", { m: s.extend_minutes })}</p>}
      </div>

      {me && (
        <p className={`mt-3 rounded-card px-3 py-2 text-[13px] font-bold ${phase === "outbid" ? "bg-tomo-rose/10 text-tomo-rose" : "bg-accent-tint text-accent-ink"}`}>{me}</p>
      )}

      {/* 입찰 창 */}
      {live && (guest ? (
        <Link href={`/login?next=/listings/${s.listing_id}`} className="btn mt-4 block bg-tomo-coral-deep py-3 text-center text-sm text-white">
          {t(lang, "auction.loginCta")}
        </Link>
      ) : blockKey || bannedDate ? (
        <p className="mt-4 rounded-card bg-tomo-navy/5 p-3 text-[13px] text-ink-soft">
          {blockKey ? t(lang, blockKey) : t(lang, "auction.bannedUntil", { at: bannedDate! })}
        </p>
      ) : step === "form" ? (
        <form className="mt-4" noValidate onSubmit={(e) => { e.preventDefault(); review(); }}>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="auction-max" className="text-[13px] font-bold text-ink">{t(lang, "auction.maxLabel")}</label>
            <span className="tnum text-[12px] text-ink-soft">{t(lang, "auction.minBid")} {f(floor)}</span>
          </div>
          <div className="relative mt-1">
            <input id="auction-max" type="number" inputMode="numeric" min={floor} step={unit} value={amount}
              onChange={(e) => { edited.current = true; setAmount(e.target.value); }}
              aria-describedby="auction-max-help"
              className={`tnum w-full rounded-full bg-white py-3 text-base shadow-soft ${cur === "JPY" || lang === "ja" ? "pl-9 pr-4" : "pl-4 pr-10"}`} />
            <span aria-hidden className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[15px] font-bold text-ink-soft ${cur === "JPY" || lang === "ja" ? "left-4" : "right-4"}`}>
              {cur === "JPY" ? "¥" : lang === "ja" ? "₩" : "원"}
            </span>
          </div>
          <p id="auction-max-help" className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
            {t(lang, phase === "leading" ? "auction.raiseHelp" : "auction.maxHelp")} · {t(lang, "auction.unit", { unit: f(increment(cur, s.current_price)) })}
          </p>
          {/* 예상 결제액 — 결제와 같은 표(0057 listing_quote: 한국 상품 무게 구간·통관 예치금, 일본 상품 900엔) */}
          <div className="mt-3 rounded-card border border-tomo-navy/10 p-3 text-[13px]">
            <div className="flex justify-between gap-3"><span className="text-ink-soft">{t(lang, "auction.estItem")}</span><span className="tnum">{f(total.item)}</span></div>
            {total.intlShipping > 0 && (
              <div className="flex justify-between gap-3"><span className="text-ink-soft">{t(lang, "order.intlShipping")}</span><span className="tnum">{f(total.intlShipping)}</span></div>
            )}            {total.customsDeposit > 0 && (
              <div className="flex justify-between gap-3"><span className="text-ink-soft">{t(lang, "customs.depositLine")}</span><span className="tnum">{f(total.customsDeposit)}</span></div>
            )}
            <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
              <span className="font-bold text-ink">{t(lang, "auction.estTitle")}</span>
              <span className="text-right">
                <span className="tnum block text-[15px] font-extrabold text-ink">{f(total.total)}</span>
                {approx(total.total) && <span className="tnum block text-[11px] text-ink-soft">{approx(total.total)}</span>}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{t(lang, "auction.estNote")}</p>
          </div>
          <button className="btn mt-3 w-full bg-tomo-coral-deep py-3 text-sm text-white">
            {t(lang, phase === "leading" ? "auction.raiseBtn" : "auction.bidBtn")}
          </button>
        </form>
      ) : (
        <div ref={confirmRef} tabIndex={-1} role="group" aria-labelledby="auction-confirm-title" className="mt-4 rounded-card bg-tomo-navy/5 p-3.5 outline-none">
          <p id="auction-confirm-title" className="text-[15px] font-extrabold text-ink">{t(lang, "auction.confirmTitle", { amount: f(n) })}</p>
          <p className="mt-1 text-[13px] font-bold text-tomo-rose">{t(lang, "auction.confirmNote")}</p>
          {step === "big" && <p role="alert" className="mt-2 text-[13px] font-bold text-tomo-rose">{t(lang, "auction.confirmBig")}</p>}
          <p className="tnum mt-1 text-[12px] text-ink-soft">{t(lang, "auction.estTitle")} {f(total.total)}{approx(total.total) && ` (${approx(total.total)})`}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setStep("form")} disabled={busy === "bid"} className="btn flex-1 border-[1.5px] border-tomo-navy bg-white py-3 text-sm text-tomo-navy">
              {t(lang, "auction.back")}
            </button>
            <button type="button" onClick={bid} disabled={busy === "bid"} className="btn flex-1 bg-tomo-coral-deep py-3 text-sm text-white">
              {busy === "bid" ? t(lang, "auction.sending") : t(lang, step === "big" ? "auction.confirmBigYes" : "auction.confirmYes")}
            </button>
          </div>
        </div>
      ))}

      {/* 낙찰자 결제 */}
      {s.viewer.can_pay && (
        <div className="mt-4">
          {s.pay_due_at && (
            <p className="tnum mb-2 text-[13px] font-bold text-tomo-rose">
              {t(lang, "auction.payDue", { at: fmtAt(s.pay_due_at, lang), left: payLeft == null ? "—" : countdownText(lang, payLeft) })}
            </p>
          )}
          <button type="button" onClick={pay} disabled={busy === "pay"} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">
            {busy === "pay" ? t(lang, "detail.connecting") : t(lang, "act.pay")}
          </button>
          <p className="mt-1.5 text-[11px] text-ink-faint">{t(lang, "auction.payHint")}</p>
        </div>
      )}
      {/* 미결제로 끝난 경매의 tx_id 는 취소된 마지막 결제창이다 — 판매자가 「거래 보기」로 취소된 거래를 보고 헷갈리지 않게 결제 대기·결제 완료일 때만 */}
      {s.viewer.tx_id && (s.status === "awaiting_payment" || s.status === "paid") && (
        <Link href={`/transactions/${s.viewer.tx_id}`} className="press mt-3 inline-block text-[13px] font-bold text-accent underline underline-offset-2">{t(lang, "auction.viewTx")}</Link>
      )}

      {/* 판매자 */}
      {phase === "seller" && live && (s.bid_count === 0 ? (
        cancelAsk ? (
          <div className="mt-4 rounded-card bg-tomo-navy/5 p-3 text-[13px]">
            <p className="font-bold text-ink">{t(lang, "auction.cancelConfirm")}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setCancelAsk(false)} className="btn flex-1 border-[1.5px] border-tomo-navy bg-white py-2.5 text-[13px] text-tomo-navy">{t(lang, "auction.back")}</button>
              <button type="button" onClick={() => seller("cancel")} disabled={busy === "cancel"} className="btn flex-1 bg-tomo-rose py-2.5 text-[13px] text-white">{t(lang, "auction.cancel")}</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setCancelAsk(true)} className="btn mt-4 w-full border-[1.5px] border-tomo-navy bg-white py-2.5 text-[13px] text-tomo-navy">{t(lang, "auction.cancel")}</button>
        )
      ) : <p className="mt-3 text-[12px] text-ink-soft">{t(lang, "auction.cancelBlocked")}</p>)}
      {phase === "seller" && s.status === "awaiting_payment" && s.pay_due_at && (
        <p className="mt-3 text-[13px] text-ink-soft">{t(lang, "auction.sellerWaiting", { at: fmtAt(s.pay_due_at, lang) })}</p>
      )}
      {phase === "seller" && sellerCanRelist(s.status, listingStatus) && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[12px] text-ink-soft">{t(lang, "auction.relistHint")}</p>
          <button type="button" onClick={() => seller("relist")} disabled={!!busy} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">{t(lang, "auction.relist")}</button>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void seller("convert"); }}>
            <label className="sr-only" htmlFor="auction-convert">{t(lang, "auction.convertPrice")}</label>
            <input id="auction-convert" type="number" inputMode="numeric" min={1} value={convertPriceIn} onChange={(e) => setConvertPriceIn(e.target.value)}
              placeholder={t(lang, "auction.convertPrice")} className="tnum min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-base shadow-soft" />
            <button disabled={!!busy} className="btn shrink-0 border-[1.5px] border-tomo-navy bg-white px-4 py-2.5 text-[13px] text-tomo-navy">{t(lang, "auction.convert")}</button>
          </form>
        </div>
      )}

      {msg && <p role={msg.err ? "alert" : "status"} className={`mt-3 text-[13px] ${msg.err ? "text-tomo-rose" : "font-bold text-accent-ink"}`}>{msg.text}</p>}

      {/* 입찰 기록 — 입찰자는 번호로만(사이트 밖 직접 연락 방지) */}
      <div className="mt-5">
        <h3 className="text-[13px] font-bold text-ink">{t(lang, "auction.history")}</h3>
        {s.bids.length === 0 ? (
          <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "auction.noBids")}</p>
        ) : (
          <ol className="mt-1 divide-y divide-tomo-navy/5">
            {s.bids.map((b, i) => (
              <li key={`${b.at}-${i}`} className="tnum flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className={b.me ? "font-bold text-accent-ink" : "text-ink"}>
                  {b.me ? t(lang, "auction.bidderMe") : t(lang, "auction.bidder", { n: b.no })}
                  {b.kind === "auto" && <span className="ml-1.5 rounded-full bg-tomo-navy/5 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft">{t(lang, "auction.auto")}</span>}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="font-bold text-ink">{f(b.amount)}</span>
                  <span className="text-[11px] text-ink-faint">{fmtAt(b.at, lang)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-1 text-[11px] text-ink-faint">{t(lang, "auction.historyNote")}</p>
      </div>
    </section>
  );
}
