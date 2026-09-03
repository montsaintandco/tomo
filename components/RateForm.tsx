"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function RateForm({ pair, rate, updatedAt }: { pair: string; rate: number; updatedAt: string }) {
  const [value, setValue] = useState(String(rate));
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) { setMsg("양수만"); return; }
    setBusy(true); setMsg("");
    const { error } = await createBrowserSupabase().from("exchange_rates")
      .update({ rate: n, updated_at: new Date().toISOString() }).eq("pair", pair);
    setBusy(false);
    setMsg(error ? error.message : "저장됨");
    if (!error) startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={save} className="card flex items-center gap-3 p-3.5">
      <span className="w-24 shrink-0 text-[13px] font-bold text-ink">{pair}</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal"
        className="tnum min-w-0 flex-1 rounded-full bg-tomo-ivory px-4 py-2.5 text-base" />
      <button disabled={busy || isPending} className="btn bg-tomo-navy px-4 py-2 text-sm text-white">저장</button>
      <span className="w-20 shrink-0 text-right text-[11px] text-ink-faint">{msg || new Date(updatedAt).toLocaleDateString("ko-KR")}</span>
    </form>
  );
}
