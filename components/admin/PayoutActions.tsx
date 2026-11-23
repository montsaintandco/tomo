"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

// 출금 처리 — 지급 완료(송금 후) 또는 반려(사유 필수, 원장 복구). 한국어 고정
export default function PayoutActions({ id, label }: { id: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isPending, start] = useTransition();
  const router = useRouter();

  async function run(sent: boolean) {
    let note = "";
    if (sent) {
      if (!confirm(`${label} 송금을 마쳤나요? 지급 완료로 바꾸면 되돌릴 수 없어요.`)) return;
      note = prompt("메모 (선택, 이체 확인번호 등)") ?? "";
    } else {
      note = (prompt(`${label} 신청을 반려할까요? 사유를 적어 주세요 (고객에게 보여요).`) ?? "").trim();
      if (!note) return;
    }
    setBusy(true); setError("");
    const { error: e } = await createBrowserSupabase().rpc("admin_process_payout", { p_id: id, p_sent: sent, p_note: note });
    setBusy(false);
    if (e) { setError(e.message); return; }
    start(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col items-end">
      <span className="flex gap-1">
        <button type="button" disabled={busy || isPending} onClick={() => run(true)}
          className="press rounded-full bg-tomo-navy px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-45">지급 완료</button>
        <button type="button" disabled={busy || isPending} onClick={() => run(false)}
          className="press rounded-full bg-tomo-coral-deep/10 px-3 py-1.5 text-[12px] font-bold text-tomo-coral-deep disabled:opacity-45">반려</button>
      </span>
      {error && <span role="alert" className="mt-1 text-[11px] text-tomo-rose">{error}</span>}
    </span>
  );
}
