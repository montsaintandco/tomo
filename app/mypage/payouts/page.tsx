import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice, type Currency } from "@/lib/currency";
import { rows, tableMissing } from "@/lib/safe";
import { CURRENCIES, LEDGER_KIND_KEY, PAYOUT_STATUS_KEY, maskAccount, signed, type LedgerKind, type PayoutStatus } from "@/lib/payouts";
import PayoutAccountForm from "@/components/PayoutAccountForm";
import PayoutRequestForm from "@/components/PayoutRequestForm";
import { redirect } from "next/navigation";

export const metadata = { title: "정산·출금 · 精算・出金 | TOMO", robots: { index: false } };

type Bal = { currency: Currency; balance: number; pending: number };
type Ledger = { id: number; currency: Currency; amount: number; kind: LedgerKind; memo: string; created_at: string };
type Payout = { id: string; currency: Currency; amount: number; bank_name: string; account_number: string; status: PayoutStatus; admin_note: string; requested_at: string };
type Account = { currency: Currency; bank_name: string; account_number: string; account_holder: string };

// 마이페이지 > 정산·출금 (셸은 app/mypage/layout.tsx). 잔액 정본 = DB seller_balances() (원장 합)
export default async function PayoutsPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/mypage/payouts");
  const lang: Lang = viewer.language;

  const [balRes, ledRes, payRes, accRes] = await Promise.all([
    supabase.rpc("seller_balances"),
    supabase.from("seller_ledger").select("id, currency, amount, kind, memo, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("payouts").select("id, currency, amount, bank_name, account_number, status, admin_note, requested_at").order("requested_at", { ascending: false }).limit(20),
    supabase.from("payout_accounts").select("currency, bank_name, account_number, account_holder"),
  ]);
  const missing = tableMissing(balRes.error) || tableMissing(ledRes.error);
  const bals = rows(balRes as { data: Bal[] | null; error: typeof balRes.error });
  const ledger = rows(ledRes as { data: Ledger[] | null; error: typeof ledRes.error });
  const payouts = rows(payRes as { data: Payout[] | null; error: typeof payRes.error });
  const accounts = rows(accRes as { data: Account[] | null; error: typeof accRes.error });

  const shown = CURRENCIES.filter((c) => c === viewer.currency
    || bals.some((b) => b.currency === c && (Number(b.balance) !== 0 || Number(b.pending) !== 0))
    || accounts.some((a) => a.currency === c));
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === "ja" ? "ja-JP" : "ko-KR");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[19px] font-extrabold text-ink">{t(lang, "payout.title")}</h1>
        <p className="mt-1 text-[13px] text-ink-soft">{t(lang, "payout.sub")}</p>
      </header>

      {missing ? (
        <p className="card p-4 text-[13px] text-ink-soft">{t(lang, "payout.notReady")}</p>
      ) : (
        <>
          {shown.map((c) => {
            const b = bals.find((x) => x.currency === c);
            const balance = Number(b?.balance ?? 0), pending = Number(b?.pending ?? 0);
            const acc = accounts.find((a) => a.currency === c) ?? null;
            return (
              <section key={c} className="card flex flex-col gap-4 p-4 md:p-5" aria-label={`${t(lang, "payout.title")} ${c}`}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[12px] font-bold text-ink-soft">{t(lang, "payout.available")}</p>
                    <p className="tnum mt-0.5 text-[22px] font-extrabold text-ink">{formatPrice(balance, c, lang)}</p>
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-ink-soft">{t(lang, "payout.pending")}</p>
                    <p className="tnum mt-0.5 text-[22px] font-extrabold text-ink-soft">{formatPrice(pending, c, lang)}</p>
                  </div>
                </div>
                <PayoutRequestForm lang={lang} currency={c} balance={balance} bankName={acc?.bank_name ?? null}
                  hasPending={payouts.some((p) => p.currency === c && p.status === "requested")} />
                <details className="border-t border-tomo-navy/10 pt-3" open={!acc}>
                  <summary className="cursor-pointer text-[13px] font-bold text-ink">
                    {t(lang, "payout.account")}
                    {acc && <span className="ml-2 font-normal text-ink-soft">{acc.bank_name} {maskAccount(acc.account_number)} · {acc.account_holder}</span>}
                  </summary>
                  <div className="mt-3"><PayoutAccountForm lang={lang} userId={viewer.id} currency={c} initial={acc} /></div>
                </details>
              </section>
            );
          })}

          <section aria-label={t(lang, "payout.requests")}>
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "payout.requests")}</h2>
            {payouts.length ? (
              <ul className="card divide-y divide-tomo-navy/10">
                {payouts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{t(lang, PAYOUT_STATUS_KEY[p.status])}</p>
                      <p className="truncate text-[12px] text-ink-soft">
                        {date(p.requested_at)} · {p.bank_name} {maskAccount(p.account_number)}
                        {p.status === "rejected" && p.admin_note ? ` · ${p.admin_note}` : ""}
                      </p>
                    </div>
                    <span className="tnum shrink-0 font-bold text-ink">{formatPrice(p.amount, p.currency, lang)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="card p-4 text-[13px] text-ink-soft">{t(lang, "payout.noLedger")}</p>}
          </section>

          <section aria-label={t(lang, "payout.ledger")}>
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "payout.ledger")}</h2>
            {ledger.length ? (
              <ul className="card divide-y divide-tomo-navy/10">
                {ledger.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{t(lang, LEDGER_KIND_KEY[l.kind])}</p>
                      <p className="truncate text-[12px] text-ink-soft">{date(l.created_at)}{l.kind === "adjust" && l.memo ? ` · ${l.memo}` : ""}</p>
                    </div>
                    <span className={`tnum shrink-0 font-bold ${l.amount < 0 ? "text-ink-soft" : "text-tomo-navy"}`}>
                      {signed(l.amount, (n) => formatPrice(n, l.currency, lang))}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="card p-4 text-[13px] text-ink-soft">{t(lang, "payout.noLedger")}</p>}
          </section>
        </>
      )}
    </div>
  );
}
