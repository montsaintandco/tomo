"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

// 신고 처리 — 처리완료·기각·다시 열기(admin_resolve_report, 활동 기록 남음). 상품 신고는 숨김도 바로(admin_set_listing_hidden)
export default function ReportActions({ id, status, targetType, targetId }: {
  id: string; status: string; targetType: string; targetId: string;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true); setError("");
    const { error: e } = await createBrowserSupabase().rpc(fn, args);
    setBusy(false);
    if (e) { setError(e.message); return; }
    startTransition(() => router.refresh());
  }
  const resolve = (s: string) => run("admin_resolve_report", { p_id: id, p_status: s, p_note: note.trim() });
  const btn = "press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold";
  const off = busy || isPending;

  return (
    <div className="flex w-[220px] flex-col items-end gap-1.5">
      {status === "open" ? (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="처리 메모 (선택)"
            className="w-full rounded-md border border-[var(--a-border)] bg-white px-2 py-1 text-[12px]" />
          <div className="flex flex-wrap justify-end gap-1.5">
            {targetType === "listing" && (
              <button type="button" disabled={off} className={`${btn} text-tomo-rose`}
                onClick={() => { if (window.confirm("이 상품을 숨길까요? 판매자는 되살릴 수 없어요.")) run("admin_set_listing_hidden", { p_id: targetId, p_hidden: true }); }}>
                상품 숨김
              </button>
            )}
            <button type="button" disabled={off} onClick={() => resolve("dismissed")} className={`${btn} text-ink-soft`}>기각</button>
            <button type="button" disabled={off} onClick={() => resolve("resolved")} className={`${btn} text-tomo-navy`}>처리 완료</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={off} onClick={() => resolve("open")} className={`${btn} text-ink-soft`}>다시 열기</button>
      )}
      {error && <p className="text-[11px] text-tomo-rose">{error}</p>}
    </div>
  );
}
