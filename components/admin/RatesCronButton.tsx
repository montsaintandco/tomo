"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// /api/cron/rates 를 운영자 세션으로 부른다. force = 3% 보류 검사 생략(보류된 값을 확인하고 적용)
export default function RatesCronButton({ force = false, label }: { force?: boolean; label: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  async function run() {
    if (force && !confirm("원천 값으로 바로 적용할까요? 상품 환산 가격이 바뀝니다")) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/cron/rates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(({ applied: "적용됨", held: "보류(3% 초과)", unchanged: "변동 없음", failed: "실패" } as Record<string, string>)[d.status] ?? `오류 ${r.status}`);
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={run} disabled={busy} className="btn bg-tomo-navy px-3 py-1.5 text-[12px] text-white">{label}</button>
      {msg && <span className="text-[12px] text-ink-faint">{msg}</span>}
    </span>
  );
}
