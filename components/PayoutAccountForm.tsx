"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang, type I18nKey } from "@/lib/i18n";
import { normalizeAccount } from "@/lib/payouts";
import type { Currency } from "@/lib/currency";

type Account = { bank_name: string; account_number: string; account_holder: string };

// 정산 계좌 등록·수정 — 통화별 1개, RLS "own payout accounts" 로 본인 upsert
export default function PayoutAccountForm({ lang, userId, currency, initial }: {
  lang: Lang; userId: string; currency: Currency; initial?: Account | null;
}) {
  const [f, setF] = useState<Account>(initial ?? { bank_name: "", account_number: "", account_holder: "" });
  const [msg, setMsg] = useState<{ key: I18nKey; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, start] = useTransition();
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = normalizeAccount(f);
    if (!n.ok) { setMsg({ key: n.error, ok: false }); return; }
    setBusy(true); setMsg(null);
    const { error } = await createBrowserSupabase().from("payout_accounts")
      .upsert({ user_id: userId, currency, ...n.value }, { onConflict: "user_id,currency" });
    setBusy(false);
    if (error) { setMsg({ key: "payout.err.generic", ok: false }); return; }
    setMsg({ key: "payout.saved", ok: true });
    start(() => router.refresh());
  }

  const field = (k: keyof Account, label: I18nKey, mode?: "numeric") => (
    <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-soft">
      {t(lang, label)}
      <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required maxLength={k === "account_number" ? 40 : 60}
        inputMode={mode} autoComplete="off" className="h-10 w-full px-3 text-[14px] font-normal text-ink" />
    </label>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-2.5">
      {field("bank_name", "payout.bank")}
      {field("account_number", "payout.accountNumber", "numeric")}
      {field("account_holder", "payout.holder")}
      <div className="flex items-center justify-between gap-2">
        {msg ? <p role="status" className={`text-[12px] ${msg.ok ? "text-tomo-navy" : "text-tomo-rose"}`}>{t(lang, msg.key)}</p> : <span />}
        <button type="submit" disabled={busy || isPending} className="btn bg-tomo-navy px-4 py-2 text-[13px] text-white disabled:opacity-45">
          {t(lang, "payout.saveAccount")}
        </button>
      </div>
    </form>
  );
}
