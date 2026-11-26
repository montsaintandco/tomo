import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, ORDER_META, fmtDate, money } from "@/components/admin/ui";
import Link from "next/link";
import { rows as safeRows } from "@/lib/safe";

const FILTERS = [{ value: "", label: "전체" }, { value: "paid", label: "결제 완료" }, { value: "pending_payment", label: "결제 대기" }, { value: "cancelled", label: "취소" }];
const PAY: Record<string, string> = { card: "카드", kakao_pay: "카카오페이", naver_pay: "네이버페이" };

// 대행 주문(카트 결제 단위) — 하위 대행 요청 개수·배송지·결제수단
export default async function AdminOrdersPage(props: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await props.searchParams;
  const supabase = await createServerSupabase();
  let q = supabase.from("proxy_orders")
    .select("id, status, currency, subtotal, intl_shipping, service_fee, total, payment_method, ship_name, ship_address, created_at, profiles!proxy_orders_user_id_fkey(nickname), proxy_requests(count)")
    .order("created_at", { ascending: false }).limit(100);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; status: string; currency: string; subtotal: number; intl_shipping: number; service_fee: number; total: number; payment_method: string;
    ship_name: string; ship_address: string; created_at: string; profiles: { nickname: string } | null; proxy_requests: { count: number }[];
  }[];

  // 환불·실청구 원화(0025) — 별도 조회, 테이블·컬럼이 없으면 비움
  const ids = rows.map((r) => r.id);
  const [refundRes, krwRes] = ids.length
    ? await Promise.all([
      supabase.from("refunds").select("proxy_order_id, amount, status").in("proxy_order_id", ids),
      supabase.from("proxy_orders").select("id, paid_krw").in("id", ids),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const refunded: Record<string, { sum: number; open: number }> = {};
  for (const f of safeRows(refundRes) as { proxy_order_id: string; amount: number; status: string }[]) {
    const x = (refunded[f.proxy_order_id] ??= { sum: 0, open: 0 });
    x.sum += f.amount; if (f.status !== "done") x.open += 1;
  }
  const paidKrw = Object.fromEntries((safeRows(krwRes) as { id: string; paid_krw: number | null }[]).map((x) => [x.id, x.paid_krw]));

  return (
    <>
      <PageHeader title="주문" sub="장바구니 결제 단위. 상품별 진행은 대행 요청에서" />
      <FilterTabs base="/admin/orders" param="status" options={FILTERS} current={status} />
      <Panel>
        {error && <p className="a-muted p-4 text-[12px]">{error.message}</p>}
        <Table head={["주문", "주문자", "항목", "총액", "환불", "결제수단", "배송지", "상태", "생성"]} empty="주문이 없어요">
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/order/${r.id}`} className="a-link tnum">{r.id.slice(0, 8)}</Link></td>
              <td className="whitespace-nowrap">{r.profiles?.nickname}</td>
              <td className="tnum">{r.proxy_requests?.[0]?.count ?? 0}</td>
              <td className="tnum whitespace-nowrap">
                {money(r.total, r.currency)}
                <span className="a-faint block text-[11px]">상품 {money(r.subtotal, r.currency)} · 배송 {money(r.intl_shipping, r.currency)} · 수수료 {money(r.service_fee, r.currency)}</span>
                {paidKrw[r.id] != null && <span className="a-faint block text-[11px]">청구 {money(paidKrw[r.id]!, "KRW")}</span>}
              </td>
              <td className="tnum whitespace-nowrap">
                {refunded[r.id] ? <>
                  {money(refunded[r.id].sum, r.currency)}
                  {refunded[r.id].open > 0 && <Link href="/admin/refunds" className="mt-0.5 block"><Pill tone="amber">대기 {refunded[r.id].open}</Pill></Link>}
                </> : <span className="a-faint">—</span>}
              </td>
              <td className="whitespace-nowrap">{PAY[r.payment_method] ?? r.payment_method}</td>
              <td className="max-w-[220px]"><span className="block truncate">{r.ship_name}</span><span className="a-muted block truncate text-[12px]">{r.ship_address}</span></td>
              <td><Pill tone={ORDER_META[r.status]?.tone}>{ORDER_META[r.status]?.label ?? r.status}</Pill></td>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
