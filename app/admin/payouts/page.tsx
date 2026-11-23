import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, Kpi, FilterTabs, fmtDate, money } from "@/components/admin/ui";
import PayoutActions from "@/components/admin/PayoutActions";
import LedgerAdjustForm from "@/components/admin/LedgerAdjustForm";
import { rows, tableMissing } from "@/lib/safe";
import { LEDGER_KIND_LABEL, PAYOUT_META, signed, type LedgerKind, type PayoutStatus } from "@/lib/payouts";
import Link from "next/link";

type Payout = {
  id: string; user_id: string; currency: string; amount: number; bank_name: string; account_number: string; account_holder: string;
  status: PayoutStatus; admin_note: string; requested_at: string; processed_at: string | null; profiles: { nickname: string } | null;
};
type Ledger = { id: number; user_id: string; currency: string; amount: number; kind: LedgerKind; memo: string; created_at: string; profiles: { nickname: string } | null };
type Liability = { currency: string; balance: number; pending: number; users: number };

const FILTERS = [{ value: "", label: "신청 중" }, { value: "sent", label: "지급 완료" }, { value: "rejected", label: "반려" }, { value: "all", label: "전체" }];

// 판매 정산·출금 — 신청 처리(송금 후 지급 완료 / 반려 = 원장 복구), 미지급 합계, 수동 조정, 최근 원장
export default async function AdminPayoutsPage(props: { searchParams: Promise<{ s?: string }> }) {
  const { s = "" } = await props.searchParams;
  const supabase = await createServerSupabase();

  let q = supabase.from("payouts")
    .select("id, user_id, currency, amount, bank_name, account_number, account_holder, status, admin_note, requested_at, processed_at, profiles!payouts_user_id_fkey(nickname)")
    .order("requested_at", { ascending: s === "" }).limit(200);
  if (s === "") q = q.eq("status", "requested");
  else if (s !== "all") q = q.eq("status", s);

  const [payRes, liabRes, ledRes] = await Promise.all([
    q,
    supabase.rpc("admin_seller_liability"),
    supabase.from("seller_ledger").select("id, user_id, currency, amount, kind, memo, created_at, profiles!seller_ledger_user_id_fkey(nickname)")
      .order("created_at", { ascending: false }).limit(50),
  ]);
  const missing = tableMissing(payRes.error) || tableMissing(liabRes.error);
  const payouts = rows(payRes as unknown as { data: Payout[] | null; error: typeof payRes.error });
  const liab = rows(liabRes as { data: Liability[] | null; error: typeof liabRes.error });
  const ledger = rows(ledRes as unknown as { data: Ledger[] | null; error: typeof ledRes.error });

  if (missing) {
    return (
      <>
        <PageHeader title="판매 정산·출금" />
        <Panel><p className="a-muted p-6 text-[13px]">마이그레이션 미적용 — supabase/migrations/0026_payouts.sql 을 적용하면 이 화면이 열려요.</p></Panel>
      </>
    );
  }

  const nick = (u: string, p: { nickname: string } | null) => <Link href={`/admin/users/${u}`} className="a-link">{p?.nickname ?? u.slice(0, 8)}</Link>;

  return (
    <>
      <PageHeader title="판매 정산·출금" sub="구매확정된 거래가 판매자 원장에 적립된다. 출금은 송금 후 「지급 완료」를 누른다." />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["KRW", "JPY"] as const).map((c) => {
          const l = liab.find((x) => x.currency === c);
          const bal = Number(l?.balance ?? 0), pen = Number(l?.pending ?? 0);
          return <Kpi key={c} label={`미지급 합계 ${c}`} value={money(bal + pen, c)} sub={`잔액 ${money(bal, c)} · 신청 중 ${money(pen, c)} · ${Number(l?.users ?? 0)}명`} />;
        })}
      </div>

      <FilterTabs base="/admin/payouts" param="s" options={FILTERS} current={s} />
      <Panel className="mb-5" title="출금 신청" count={payouts.length}>
        <Table head={["신청", "회원", "금액", "계좌", "상태", "메모", ""]} empty="출금 신청이 없어요">
          {payouts.map((p) => (
            <tr key={p.id}>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(p.requested_at)}</td>
              <td>{nick(p.user_id, p.profiles)}</td>
              <td className="tnum whitespace-nowrap font-semibold">{money(p.amount, p.currency)}</td>
              <td className="whitespace-nowrap text-[12px]">{p.bank_name} <span className="tnum">{p.account_number}</span> · {p.account_holder}</td>
              <td><Pill tone={PAYOUT_META[p.status].tone}>{PAYOUT_META[p.status].label}</Pill>
                {p.processed_at && <span className="a-faint tnum ml-1 text-[11px]">{fmtDate(p.processed_at)}</span>}</td>
              <td className="a-muted max-w-[220px] truncate text-[12px]">{p.admin_note || "—"}</td>
              <td className="text-right">
                {p.status === "requested" && <PayoutActions id={p.id} label={`${p.account_holder} ${money(p.amount, p.currency)}`} />}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel className="mb-5" title="원장 수동 조정">
        <LedgerAdjustForm />
      </Panel>

      <Panel title="최근 원장" count={ledger.length}>
        <Table head={["일시", "회원", "구분", "금액", "메모"]} empty="원장이 비어 있어요">
          {ledger.map((l) => (
            <tr key={l.id}>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(l.created_at)}</td>
              <td>{nick(l.user_id, l.profiles)}</td>
              <td className="whitespace-nowrap">{LEDGER_KIND_LABEL[l.kind]}</td>
              <td className={`tnum whitespace-nowrap ${l.amount < 0 ? "a-muted" : "font-semibold"}`}>{signed(l.amount, (n) => money(n, l.currency))}</td>
              <td className="a-muted max-w-[260px] truncate text-[12px]">{l.memo || "—"}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
