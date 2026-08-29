"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function ProxyActions({ id, status, isOwner, isAdmin }: {
  id: string; status: string; isOwner: boolean; isAdmin: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState("");
  const router = useRouter();
  const working = busy || isPending;

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
    setBusy(false);
    if (error) { setError(error.message); return; }
    // refresh 완료까지 isPending으로 잠금 — 새 상태의 다음 액션이 바로 눌리게
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.some((a) => a.tracking) && (
        <input value={tracking} onChange={(e) => setTracking(e.target.value)}
          placeholder="국제 운송장 번호" maxLength={100}
          className="rounded-full bg-white px-4 py-2.5 text-sm shadow-[var(--shadow-soft)] placeholder:text-ink-soft" />
      )}
      {actions.map((a) => (
        <button key={a.to} onClick={() => run(a.to, a.tracking)} disabled={working}
          className={`btn w-full py-3 ${
            a.outline ? "border-[1.5px] border-tomo-navy/15 bg-white text-ink-soft" : "bg-tomo-coral-deep text-white"}`}>
          {working ? "처리 중…" : a.label}
        </button>
      ))}
      {error && <p className="text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
