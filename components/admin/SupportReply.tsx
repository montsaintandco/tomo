"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

// 문의 답변 — 펼쳐서 한 번 답하고 answered, 또는 닫기 (RLS: admin answers tickets)
export default function SupportReply({ id, status }: { id: string; status: string }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function save(update: Record<string, unknown>) {
    setBusy(true); setError("");
    const { error: e } = await createBrowserSupabase().from("support_tickets").update(update).eq("id", id);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (status === "closed") return null;
  return (
    <div className="flex flex-col items-end gap-1.5">
      {!open ? (
        <div className="flex gap-1.5">
          {status === "open" && <button type="button" onClick={() => setOpen(true)} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy">답변</button>}
          <button type="button" disabled={busy || isPending} onClick={() => save({ status: "closed" })} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-ink-soft">닫기</button>
        </div>
      ) : (
        <form className="flex w-[280px] flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); if (reply.trim()) save({ reply: reply.trim(), status: "answered", answered_at: new Date().toISOString() }); }}>
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} maxLength={2000} required placeholder="답변 내용 (사용자 언어로)"
            className="rounded-md border border-[var(--a-border)] bg-white px-2 py-1.5 text-[13px]" />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)} className="press rounded-full px-3 py-1.5 text-[12px] font-bold text-ink-soft">취소</button>
            <button type="submit" disabled={busy || isPending} className="press rounded-full bg-tomo-navy px-3 py-1.5 text-[12px] font-bold text-white">답변 보내기</button>
          </div>
        </form>
      )}
      {error && <p className="text-[11px] text-tomo-rose">{error}</p>}
    </div>
  );
}
