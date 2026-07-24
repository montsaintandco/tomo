"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

type Role = "buyer" | "seller" | "other";

export default function TxActions({
  txId, status, isCrossBorder, role,
}: { txId: string; status: string; isCrossBorder: boolean; role: Role }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState("");
  const router = useRouter();

  // 현재 상태·역할에서 허용되는 단일 액션 (DB advance_transaction과 정합)
  let action: { label: string; to: string; tracking?: boolean; outline?: boolean } | null = null;
  if (role === "seller" && status === "paid") {
    action = isCrossBorder
      ? { label: "센터로 발송", to: "shipped_to_center", tracking: true }
      : { label: "발송 완료", to: "shipped", tracking: true };
  } else if (role === "buyer" && ((!isCrossBorder && status === "shipped") || (isCrossBorder && status === "shipped_international"))) {
    action = { label: "수령 확인", to: "delivered" };
  } else if (role === "buyer" && status === "delivered") {
    action = { label: "구매 확정", to: "completed" };
  } else if ((role === "buyer" || role === "seller") && status === "pending_payment") {
    action = { label: "결제 취소", to: "cancelled", outline: true };
  }
  if (!action) return null;
  const a = action;

  async function run() {
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("advance_transaction", {
      p_tx_id: txId, p_to: a.to, p_tracking: a.tracking ? (tracking.trim() || null) : null,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {a.tracking && (
        <input value={tracking} onChange={(e) => setTracking(e.target.value)}
          placeholder="운송장 번호 (선택) · 追跡番号（任意）" maxLength={100}
          className="rounded-full border px-4 py-2 text-sm" />
      )}
      <button onClick={run} disabled={busy}
        className={`w-full rounded-full py-3 font-bold disabled:opacity-50 ${
          a.outline ? "border border-tomo-navy text-tomo-navy" : "bg-tomo-coral text-white"}`}>
        {busy ? "처리 중…" : a.label}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
