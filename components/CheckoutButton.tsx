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
        className="w-full rounded-full bg-tomo-coral py-3 font-bold text-white disabled:opacity-50">
        {busy ? "연결 중…" : "안전결제"}
      </button>
      {msg && <p className="mt-1 text-xs text-gray-500">{msg}</p>}
    </div>
  );
}
