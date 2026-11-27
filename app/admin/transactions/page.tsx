import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, Pager, TX_META, fmtDate, money } from "@/components/admin/ui";
import { pageOf } from "@/components/admin/paging";
import Link from "next/link";
import TxActions from "@/components/TxActions";
import { rows as safeRows } from "@/lib/safe";
import { parseOrderCode, orderLabel } from "@/lib/order-code";

// 운영자가 이 화면에서 바로 처리하는 상태: 취소·환불(결제~센터 입고), 센터 입고·국제 발송, 강제 구매확정(배송 도착)
const ACTIONABLE = ["paid", "shipped_to_center", "center_received", "delivered"];
const REFUND: Record<string, { label: string; tone: "amber" | "red" | "green" }> = {
  pending: { label: "환불 대기", tone: "amber" }, failed: { label: "환불 실패", tone: "red" }, done: { label: "환불 완료", tone: "green" },
};

const OPEN = ["paid", "shipped", "shipped_to_center", "center_received", "shipped_international", "delivered"];
const FILTERS = [
  { value: "", label: "전체" }, { value: "open", label: "진행 중" }, { value: "disputed", label: "분쟁" },
  { value: "completed", label: "완료" }, { value: "cancelled", label: "취소" }, { value: "pending_payment", label: "결제 대기" },
];

// 전체 거래 — 에스크로 상태 전부. 행은 거래 상세(운영자는 0010 RLS로 열람·센터 액션)
export default async function AdminTransactionsPage(props: { searchParams: Promise<{ status?: string; page?: string; q?: string }> }) {
  const sp = await props.searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status ?? "" : "";
  const { page, from, to, size } = pageOf(sp.page);
  const qText = (sp.q ?? "").trim().slice(0, 20);
  const code = parseOrderCode(qText);
  const params = { status: status || undefined, page: page > 1 ? String(page) : undefined, q: qText || undefined };
  const supabase = await createServerSupabase();
  let q = supabase.from("transactions")
    .select("id, code, status, is_cross_border, meetup, center, item_price, currency, updated_at, listings!transactions_listing_id_fkey(title), buyer:profiles!transactions_buyer_id_fkey(nickname), seller:profiles!transactions_seller_id_fkey(nickname)", { count: "exact" })
    .order("updated_at", { ascending: false }).range(from, to);
  if (status === "open") q = q.in("status", OPEN);
  else if (status) q = q.eq("status", status);
  if (qText) q = q.eq("code", code?.kind === "tx" ? code.code : "-");   // 번호가 아니면 0건
  const { data, count } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; code: string | null; status: string; is_cross_border: boolean; meetup: boolean; center: string | null; item_price: number; currency: string; updated_at: string;
    listings: { title: string } | null; buyer: { nickname: string } | null; seller: { nickname: string } | null;
  }[];
  const cancelledIds = rows.filter((r) => r.status === "cancelled").map((r) => r.id);
  const refundRes = cancelledIds.length
    ? await supabase.from("refunds").select("transaction_id, status").eq("kind", "tx").in("transaction_id", cancelledIds)
    : { data: [], error: null };
  const refundOf = Object.fromEntries((safeRows(refundRes) as { transaction_id: string; status: string }[]).map((f) => [f.transaction_id, f.status]));

  return (
    <>
      <PageHeader title="거래" sub="에스크로 거래 전체. 최근 갱신순" />
      <div className="flex flex-wrap items-start gap-3">
        <FilterTabs base="/admin/transactions" param="status" options={FILTERS} current={status} keep={params} />
        <form className="mb-3 flex gap-2" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={qText} placeholder="거래 번호 TX000123" aria-label="거래 번호 검색" className="h-8 w-48 px-3 text-[13px]" />
        </form>
      </div>
      <Panel>
        <Table head={["번호", "상품", "구매자 → 판매자", "금액", "유형", "상태", "갱신", ""]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="tnum whitespace-nowrap"><Link href={`/transactions/${r.id}`} className="a-link">{orderLabel(r.code, r.id)}</Link></td>
              <td><Link href={`/transactions/${r.id}`} className="a-link block max-w-[260px] truncate">{r.listings?.title ?? "—"}</Link></td>
              <td className="whitespace-nowrap">{r.buyer?.nickname} <span className="a-faint">→</span> {r.seller?.nickname}</td>
              <td className="tnum whitespace-nowrap">{money(r.item_price, r.currency)}</td>
              <td className="a-muted whitespace-nowrap">{r.meetup ? "만남" : r.is_cross_border ? `국제 · ${r.center === "NARITA" ? "나리타" : "서울"}` : "국내"}</td>
              <td>
                <Pill tone={TX_META[r.status]?.tone}>{TX_META[r.status]?.label ?? r.status}</Pill>
                {refundOf[r.id] && <span className="mt-1 block"><Pill tone={REFUND[refundOf[r.id]]?.tone}>{REFUND[refundOf[r.id]]?.label ?? refundOf[r.id]}</Pill></span>}
              </td>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at)}</td>
              <td className="min-w-[240px]">
                {ACTIONABLE.includes(r.status) && (
                  <details>
                    <summary className="a-link text-[12px]">처리 ▾</summary>
                    <div className="reveal mt-2"><TxActions txId={r.id} status={r.status} isCrossBorder={r.is_cross_border} meetup={r.meetup} role="admin" lang="ko" /></div>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <Pager base="/admin/transactions" params={params} page={page} size={size} total={count} shown={rows.length} />
      </Panel>
    </>
  );
}
