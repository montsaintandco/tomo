"use client";
import { useState } from "react";

export default function CheckoutButton({ listingId }: { listingId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503) { setMsg("결제 준비 중이에요 · 決済準備中"); setBusy(false); return; }
      if (!res.ok) throw new Error(json.error || "결제 시작 실패");
      if (json.url) { window.location.href = json.url; return; }              // Stripe Checkout (Task 2)
      if (json.transactionId) { window.location.href = `/transactions/${json.transactionId}`; return; }
      setMsg("결제 준비 중이에요"); setBusy(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "결제 시작 실패"); setBusy(false);
    }
  }

  return (
    <div className="flex-1">
      <button onClick={go} disabled={busy}
        className="btn flex w-full items-center justify-center gap-1.5 bg-tomo-coral-deep py-3 text-white">
        {busy ? "연결 중…" : (
          <>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
              <path d="M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z" fill="#fff" />
            </svg>
            안전결제
          </>
        )}
      </button>
      {msg && <p className="mt-1 text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
