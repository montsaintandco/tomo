"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function ProxyActions({ id, status, isOwner, isAdmin }: {
  id: string; status: string; isOwner: boolean; isAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState("");
  const router = useRouter();

  // 현재 상태·주체에서 가능한 액션 (DB advance_proxy 매트릭스와 정합)
  const actions: { label: string; to: string; tracking?: boolean; outline?: boolean }[] = [];
  if (isOwner && status === "quoted") actions.push({ label: "견적 승인하기", to: "approved" });
  if (isOwner && status === "delivered") actions.push({ label: "수령 확인", to: "completed" });
  if (isOwner && ["requested", "quoted", "approved"].includes(status))
    actions.push({ label: "신청 취소", to: "cancelled", outline: true });
  if (isAdmin) {
    const next: Record<string, [string, string, boolean?]> = {
      approved: ["결제 확인", "paid"],
      paid: ["현지 구매 시작", "purchasing"],
      purchasing: ["센터 입고", "center_received"],
      center_received: ["국제 발송", "shipped_international", true],
      shipped_international: ["배송 완료", "delivered"],
    };
    const n = next[status];
    if (n) actions.push({ label: `[운영] ${n[0]}`, to: n[1], tracking: n[2] });
  }
  if (actions.length === 0) return null;

  async function run(to: string, withTracking?: boolean) {
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("advance_proxy", {
      p_id: id, p_to: to, p_tracking: withTracking ? (tracking.trim() || null) : null,
    });
    if (error) { setError(error.message); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.some((a) => a.tracking) && (
        <input value={tracking} onChange={(e) => setTracking(e.target.value)}
          placeholder="국제 운송장 번호" maxLength={100}
          className="rounded-full border px-4 py-2 text-sm" />
      )}
      {actions.map((a) => (
        <button key={a.to} onClick={() => run(a.to, a.tracking)} disabled={busy}
          className={`w-full rounded-full py-3 font-bold disabled:opacity-50 ${
            a.outline ? "border border-tomo-navy/15 text-ink-soft" : "bg-tomo-coral-deep text-white"}`}>
          {busy ? "처리 중…" : a.label}
        </button>
      ))}
      {error && <p className="text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
