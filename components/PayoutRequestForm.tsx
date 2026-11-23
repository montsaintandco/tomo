"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang, type I18nKey } from "@/lib/i18n";
import { formatPrice, type Currency } from "@/lib/currency";
import { payoutAmountError, payoutErrorKey } from "@/lib/payouts";

// 출금 신청 — 서버 RPC request_payout 이 잠금·잔액·신청 중 1건을 다시 검사한다 (화면 검사는 안내용)
export default function PayoutRequestForm({ lang, currency, balance, bankName, hasPending }: {
  lang: Lang; currency: Currency; balance: number; bankName: string | null; hasPending: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ key: I18nKey; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, start] = useTransition();
  const router = useRouter();

  if (!bankName) return <p className="text-[13px] text-ink-soft">{t(lang, "payout.noAccount")}</p>;
  if (hasPending) return <p className="text-[13px] text-ink-soft">{t(lang, "payout.pendingNote")}</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    const err = payoutAmountError(n, balance);
    if (err) { setMsg({ key: err, ok: false }); return; }
    if (!confirm(t(lang, "payout.confirm", { amount: formatPrice(n, currency), bank: bankName! }))) return;
    setBusy(true); setMsg(null);
    const { error } = await createBrowserSupabase().rpc("request_payout", { p_currency: currency, p_amount: n });
    setBusy(false);
    if (error) { setMsg({ key: payoutErrorKey(error.message), ok: false }); return; }
    setAmount("");
    setMsg({ key: "payout.done", ok: true });
    start(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="text-[12px] font-bold text-ink-soft" htmlFor={`payout-amount-${currency}`}>{t(lang, "payout.amount")}</label>
      <div className="flex gap-2">
        <input id={`payout-amount-${currency}`} type="number" inputMode="numeric" min={1} max={balance} step={1}
          value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 min-w-0 flex-1 px-3 text-[14px]" />
        <button type="button" onClick={() => setAmount(String(balance))} disabled={balance <= 0}
          className="btn border-[1.5px] border-tomo-navy bg-white px-3 text-[13px] text-tomo-navy disabled:opacity-45">{t(lang, "payout.all")}</button>
        <button type="submit" disabled={busy || isPending || balance <= 0}
          className="btn bg-tomo-navy px-4 text-[13px] text-white disabled:opacity-45">{t(lang, "payout.request")}</button>
      </div>
      {msg && <p role="status" className={`text-[12px] ${msg.ok ? "text-tomo-navy" : "text-tomo-rose"}`}>{t(lang, msg.key)}</p>}
    </form>
  );
}
