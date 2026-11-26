"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useUnsavedGuard } from "@/components/admin/use-unsaved-guard";

export type StatusOption = { to: string; label: string; kind: "forward" | "correct" };

// 주문 항목 상태 변경 — admin_set_order_status(0037). 허용 전이는 DB 표가 정하고 화면은 그 표를 그대로 보여 준다.
// 취소·환불·구매확정은 여기 없다(대행 요청 화면의 기존 버튼).
export default function OrderStatusForm({ id, options }: { id: string; options: StatusOption[] }) {
  const [to, setTo] = useState(options.find((o) => o.kind === "forward")?.to ?? options[0]?.to ?? "");
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useUnsavedGuard(note.trim() !== "" || tracking.trim() !== "");

  if (!options.length) return <p className="a-faint text-[12px]">이 상태에서는 여기서 바꿀 수 없어요.</p>;
  const pick = options.find((o) => o.to === to);
  const needNote = pick?.kind === "correct";

  async function save() {
    if (!pick || (needNote && !note.trim())) return;
    setBusy(true); setError(""); setDone("");
    const { error: e } = await createBrowserSupabase().rpc("admin_set_order_status", {
      p_id: id, p_status: pick.to, p_note: note.trim(), p_tracking: pick.to === "shipped_international" ? tracking.trim() || null : null,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setNote(""); setTracking(""); setDone(`${pick.label}(으)로 바꿨어요`);
    startTransition(() => router.refresh());
  }

  const off = busy || isPending;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`st-${id}`}>바꿀 상태</label>
        <select id={`st-${id}`} value={to} onChange={(e) => setTo(e.target.value)} className="h-8 px-2 text-[12px]">
          {options.map((o) => <option key={o.to} value={o.to}>{o.kind === "correct" ? `↩ ${o.label}(되돌림)` : `→ ${o.label}`}</option>)}
        </select>
        {pick?.to === "shipped_international" && (
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={100} placeholder="국제 운송장(선택)" aria-label="국제 운송장"
            className="h-8 w-40 px-2 text-[12px]" />
        )}
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="메모"
          placeholder={needNote ? "되돌리는 이유(필수)" : "메모(선택)"} className="h-8 min-w-0 flex-1 px-2 text-[12px]" />
        <button type="button" onClick={save} disabled={off || (needNote && !note.trim())}
          className="btn h-8 bg-tomo-navy px-3 text-[12px] text-white disabled:opacity-45">{off ? "저장 중…" : "저장"}</button>
      </div>
      {done && <p role="status" className="text-[11px] text-tomo-navy">{done}</p>}
      {error && <p role="alert" className="text-[11px] text-tomo-rose">{error}</p>}
    </div>
  );
}
