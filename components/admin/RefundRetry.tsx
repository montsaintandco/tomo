"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// 환불 대기열 「다시 시도」 — 같은 환불 id가 토스 Idempotency-Key라 여러 번 눌러도 이중 환불 없음 (한국어 고정)
export default function RefundRetry({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function retry() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(j.status === "done" ? "환불 완료" : `실패: ${j.error ?? res.status}`);
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={retry} disabled={busy || isPending}
        className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy disabled:opacity-45">
        {busy || isPending ? "처리 중…" : "다시 시도"}
      </button>
      {msg && <span className="a-muted max-w-[220px] text-[11px]">{msg}</span>}
    </span>
  );
}