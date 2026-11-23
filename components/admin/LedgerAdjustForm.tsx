"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cls = "rounded-md border border-[var(--a-border)] bg-white px-2 py-1.5 text-[13px]";

// 판매자 원장 수동 조정 — 메모 필수, 결과 잔액 0 미만이면 DB가 거부. userId 없으면 회원 ID 입력칸을 보인다
export default function LedgerAdjustForm({ userId, defaultCurrency = "KRW" }: { userId?: string; defaultCurrency?: "KRW" | "JPY" }) {
  const [user, setUser] = useState(userId ?? "");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isPending, start] = useTransition();
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!UUID.test(user.trim())) { setError("회원 ID(UUID)를 확인해 주세요"); return; }
    if (!Number.isInteger(n) || n === 0) { setError("금액은 0이 아닌 정수 (차감은 음수)"); return; }
    if (!memo.trim()) { setError("메모는 필수예요"); return; }
    const sign = n > 0 ? "적립" : "차감";
    if (!confirm(`${Math.abs(n).toLocaleString("en-US")} ${currency} ${sign}할까요?\n메모: ${memo.trim()}`)) return;
    setBusy(true); setError("");
    const { error: err } = await createBrowserSupabase().rpc("admin_adjust_seller_ledger",
      { p_user: user.trim(), p_currency: currency, p_amount: n, p_memo: memo.trim() });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setAmount(""); setMemo("");
    start(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 p-3">
      {!userId && (
        <label className="a-muted flex flex-col gap-1 text-[11px]">회원 ID
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="uuid" className={`${cls} w-[300px]`} />
        </label>
      )}
      <label className="a-muted flex flex-col gap-1 text-[11px]">통화
        <select value={currency} onChange={(e) => setCurrency(e.target.value as "KRW" | "JPY")} className={cls}>
          <option value="KRW">KRW</option><option value="JPY">JPY</option>
        </select>
      </label>
      <label className="a-muted flex flex-col gap-1 text-[11px]">금액 (차감은 −)
        <input type="number" step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${cls} w-[140px]`} />
      </label>
      <label className="a-muted flex min-w-[200px] flex-1 flex-col gap-1 text-[11px]">메모 (필수, 사유)
        <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} className={cls} />
      </label>
      <button type="submit" disabled={busy || isPending}
        className="press h-[34px] rounded-full bg-tomo-navy px-4 text-[12px] font-bold text-white disabled:opacity-45">조정</button>
      {error && <p role="alert" className="w-full text-[11px] text-tomo-rose">{error}</p>}
    </form>
  );
}
