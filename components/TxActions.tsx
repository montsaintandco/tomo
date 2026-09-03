"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

type Role = "buyer" | "seller" | "admin" | "other";

export default function TxActions({
  txId, status, isCrossBorder, role, lang = "ko",
}: { txId: string; status: string; isCrossBorder: boolean; role: Role; lang?: Lang }) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState("");
  const router = useRouter();
  const working = busy || isPending;

  // 현재 상태·역할에서 허용되는 단일 액션 (DB advance_transaction과 정합)
  let action: { label: string; to: string; tracking?: boolean; outline?: boolean } | null = null;
  if (role === "seller" && status === "paid") {
    action = isCrossBorder
      ? { label: t(lang, "act.shipToCenter"), to: "shipped_to_center", tracking: true }
      : { label: t(lang, "act.shipped"), to: "shipped", tracking: true };
  } else if (role === "buyer" && ((!isCrossBorder && status === "shipped") || (isCrossBorder && status === "shipped_international"))) {
    action = { label: t(lang, "act.received"), to: "delivered" };
  } else if (role === "buyer" && status === "delivered") {
    action = { label: t(lang, "act.confirm"), to: "completed" };
  } else if (role === "admin" && status === "shipped_to_center") {
    action = { label: t(lang, "act.centerIn"), to: "center_received" };
  } else if (role === "admin" && status === "center_received") {
    action = { label: t(lang, "act.intlShip"), to: "shipped_international", tracking: true };
  } else if ((role === "buyer" || role === "seller") && status === "pending_payment") {
    action = { label: t(lang, "act.cancelPay"), to: "cancelled", outline: true };
  }
  if (!action) return null;
  const a = action;

  async function run() {
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("advance_transaction", {
      p_tx_id: txId, p_to: a.to, p_tracking: a.tracking ? (tracking.trim() || null) : null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    // refresh 완료까지 isPending으로 잠금 — 새 상태의 다음 액션이 바로 눌리게
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-2">
      {a.tracking && (
        <>
          <label htmlFor="tx-tracking" className="sr-only">{t(lang, "act.tracking")}</label>
          <input id="tx-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)}
            placeholder={t(lang, "act.tracking")} maxLength={100} autoComplete="off"
            className="rounded-full bg-white px-4 py-2.5 text-base shadow-soft placeholder:text-ink-soft" />
        </>
      )}
      <button onClick={run} disabled={working}
        className={`btn w-full py-3 text-sm ${
          a.outline ? "border-[1.5px] border-tomo-navy bg-white text-tomo-navy" : "bg-tomo-coral-deep text-white"}`}>
        {working ? t(lang, "act.working") : a.label}
      </button>
      {error && <p role="alert" className="text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
