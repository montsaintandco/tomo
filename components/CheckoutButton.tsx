"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";

// meetup=true: 만남 거래(여행 직거래) — 선결제 에스크로, 센터·국제배송 없음. variant link는 보조 경로용
export default function CheckoutButton({ listingId, lang = "ko", meetup = false, variant = "primary" }: {
  listingId: string; lang?: Lang; meetup?: boolean; variant?: "primary" | "link";
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, meetup }),
      });
      const json = await res.json().catch(() => ({}));
      // 503 = 결제 키 미투입 — 오류가 아니라 대기 상태
      if (res.status === 503) { setMsg(t(lang, "detail.checkoutPending")); setBusy(false); return; }
      if (!res.ok) throw new Error(json.error || t(lang, "detail.checkoutFail"));
      if (json.url) { window.location.href = json.url; return; }              // Stripe Checkout
      if (json.transactionId) { window.location.href = `/transactions/${json.transactionId}`; return; }
      setMsg(t(lang, "detail.checkoutPending")); setBusy(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t(lang, "detail.checkoutFail")); setBusy(false);
    }
  }

  const label = meetup ? t(lang, "detail.buyMeetup") : t(lang, "detail.buy");

  if (variant === "link") {
    return (
      <span>
        <button type="button" onClick={go} disabled={busy}
          className="press text-[12px] font-bold text-tomo-navy underline underline-offset-2 disabled:opacity-45">
          {busy ? t(lang, "detail.connecting") : label}
        </button>
        {msg && <span className="ml-2 text-[11px] text-ink-soft">{msg}</span>}
      </span>
    );
  }

  return (
    <div className="flex-1">
      <button onClick={go} disabled={busy}
        className="btn flex w-full items-center justify-center gap-1.5 bg-tomo-coral-deep py-3 text-sm text-white">
        {busy ? t(lang, "detail.connecting") : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M12 3.5l6.5 2.7v4.6c0 4.3-2.8 7.6-6.5 9.7-3.7-2.1-6.5-5.4-6.5-9.7V6.2z" /><path d="m9.3 11.6 1.9 1.9 3.5-3.5" />
            </svg>
            {label}
          </>
        )}
      </button>
      {msg && <p className="mt-1 text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
