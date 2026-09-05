"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";
import { payWithToss } from "@/lib/toss-client";

// 결제 대기 거래의 "결제하기" — 결제창을 닫았거나 실패한 뒤 같은 거래로 다시 연다 (주문서의 재결제와 같은 역할)
export default function PayTxButton({ txId, lang = "ko" }: { txId: string; lang?: Lang }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId: txId }) });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503) { setMsg(t(lang, "detail.checkoutPending")); setBusy(false); return; }
      if (!res.ok || !json.toss) throw new Error(json.error || t(lang, "detail.checkoutFail"));
      await payWithToss(json.toss);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "USER_CANCEL") setMsg(e instanceof Error ? e.message : t(lang, "detail.checkoutFail"));
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">
        {busy ? t(lang, "detail.connecting") : t(lang, "act.pay")}
      </button>
      {msg && <p className="mt-1 text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
