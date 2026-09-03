"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

// 운영자 화면 공용 액션 버튼 — rpc 또는 테이블 update/delete 하나를 실행하고 새로고침 (한국어 고정)
export default function AdminToggle({ label, danger, confirmText, action }: {
  label: string; danger?: boolean; confirmText?: string;
  action: { rpc: string; args: Record<string, unknown> } | { table: string; update?: Record<string, unknown>; del?: boolean; id: string; idColumn?: string };
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  async function run() {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    let err: { message: string } | null = null;
    if ("rpc" in action) {
      ({ error: err } = await supabase.rpc(action.rpc, action.args));
    } else {
      const col = action.idColumn ?? "id";
      const q = action.del
        ? supabase.from(action.table).delete().eq(col, action.id)
        : supabase.from(action.table).update(action.update ?? {}).eq(col, action.id);
      ({ error: err } = await q);
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={run} disabled={busy || isPending}
        className={`press rounded-full px-3 py-1.5 text-[12px] font-bold disabled:opacity-45 ${
          danger ? "bg-tomo-coral-deep/10 text-tomo-coral-deep" : "bg-tomo-navy/5 text-tomo-navy"}`}>
        {label}
      </button>
      {error && <span role="alert" className="mt-1 text-[11px] text-tomo-rose">{error}</span>}
    </span>
  );
}
