import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, Pager, AgeBadge, Thumb, ORDER_META, PROXY_META, fmtDate, money } from "@/components/admin/ui";
import { hrefWith, pageOf } from "@/components/admin/paging";
import DetailSheet from "@/components/admin/DetailSheet";
import OrderStatusForm, { type StatusOption } from "@/components/admin/OrderStatusForm";
import AutoRefresh from "@/components/admin/AutoRefresh";
import { agingLevel, nowMs, PROXY_STAGE } from "@/lib/admin-aging";
import { t, type I18nKey } from "@/lib/i18n";
import Link from "next/link";
import { rows as safeRows, tableMissing } from "@/lib/safe";

const FILTERS = [{ value: "", label: "전체" }, { value: "paid", label: "결제 완료" }, { value: "pending_payment", label: "결제 대기" }, { value: "cancelled", label: "취소" }];
const PAY: Record<string, string> = { card: "카드", kakao_pay: "카카오페이", naver_pay: "네이버페이" };
const UUID = /^[0-9a-f-]{36}$/;
const pLabel = (s: string) => t("ko", `pstatus.${s}` as I18nKey);

type Order = {
  id: string; status: string; currency: string; subtotal: number; intl_shipping: number; service_fee: number; total: number; payment_method: string;
  ship_name: string; ship_address: string; created_at: string; profiles: { nickname: string } | null; proxy_requests: { count: number }[];
};
type Item = { id: string; status: string; updated_at: string; intl_tracking: string | null; external_items: { title: string; images: string[] } | null };

// 대행 주문(카트 결제 단위) — 페이지 넘김·URL 필터. 행의 「상세」는 오른쪽 시트(?open=)에서 항목별 상태를 바꾼다(0037)
export default async function AdminOrdersPage(props: { searchParams: Promise<{ status?: string; page?: string; open?: string }> }) {
  const sp = await props.searchParams;
  const status = FILTERS.some((f) => f.value === sp.status) ? sp.status ?? "" : "";
  const { page, from, to, size } = pageOf(sp.page);
  const params = { status: status || undefined, page: page > 1 ? String(page) : undefined };
  const supabase = await createServerSupabase();
  let q = supabase.from("proxy_orders")
    .select("id, status, currency, subtotal, intl_shipping, service_fee, total, payment_method, ship_name, ship_address, created_at, profiles!proxy_orders_user_id_fkey(nickname), proxy_requests(count)", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, to);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  const rows = (data ?? []) as unknown as Order[];

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
    if (f.status === "void") continue;   // 무효 = 환불 없음
    const x = (refunded[f.proxy_order_id] ??= { sum: 0, open: 0 });
    x.sum += f.amount; if (f.status !== "done") x.open += 1;
  }
  const paidKrw = Object.fromEntries((safeRows(krwRes) as { id: string; paid_krw: number | null }[]).map((x) => [x.id, x.paid_krw]));
  const openId = sp.open && UUID.test(sp.open) ? sp.open : null;

  return (
    <>
      <AutoRefresh />
      <PageHeader title="주문" sub="장바구니 결제 단위. 「상세」에서 항목별 진행 상태를 바꿔요. 취소·환불은 대행 요청 화면에서" />
      <FilterTabs base="/admin/orders" param="status" options={FILTERS} current={status} keep={params} />
      <Panel>
        {error && <p className="a-muted p-4 text-[12px]">{error.message}</p>}
        <Table head={["주문", "주문자", "항목", "총액", "환불", "결제수단", "배송지", "상태", "생성", ""]} empty="주문이 없어요">
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
              <td><Link href={hrefWith("/admin/orders", params, { open: r.id })} scroll={false} className="a-link whitespace-nowrap text-[12px]">상세</Link></td>
            </tr>
          ))}
        </Table>
        <Pager base="/admin/orders" params={params} page={page} size={size} total={count} shown={rows.length} />
      </Panel>
      {openId && <OrderSheet id={openId} closeHref={hrefWith("/admin/orders", params)} />}
    </>
  );
}

async function OrderSheet({ id, closeHref }: { id: string; closeHref: string }) {
  const supabase = await createServerSupabase();
  const [orderRes, itemRes, transRes] = await Promise.all([
    supabase.from("proxy_orders").select("id, status, currency, total, created_at, profiles!proxy_orders_user_id_fkey(nickname)").eq("id", id).maybeSingle(),
    supabase.from("proxy_requests").select("id, status, updated_at, intl_tracking, external_items(title, images)").eq("order_id", id).order("created_at"),
    supabase.from("admin_order_transitions").select("from_status, to_status, kind"),
  ]);
  const o = orderRes.data as unknown as { id: string; status: string; currency: string; total: number; created_at: string; profiles: { nickname: string } | null } | null;
  const items = (itemRes.data ?? []) as unknown as Item[];
  const transitions = safeRows(transRes) as { from_status: string; to_status: string; kind: "forward" | "correct" }[];
  const actRes = items.length
    ? await supabase.from("admin_actions").select("id, action, target_id, detail, created_at, profiles!admin_actions_admin_id_fkey(nickname)")
      .eq("target_type", "proxy_request").in("target_id", items.map((i) => i.id)).order("created_at", { ascending: false }).limit(20)
    : { data: [], error: null };
  const acts = safeRows(actRes) as unknown as { id: number; action: string; target_id: string; detail: Record<string, string | null>; created_at: string; profiles: { nickname: string } | null }[];
  const now = nowMs();

  if (!o) return <DetailSheet title="주문" closeHref={closeHref}><p className="a-muted">주문을 찾지 못했어요.</p></DetailSheet>;
  return (
    <DetailSheet closeHref={closeHref}
      title={<span className="tnum">주문 {o.id.slice(0, 8)}</span>}
      sub={<>{o.profiles?.nickname} · {money(o.total, o.currency)} · {fmtDate(o.created_at)} · <Link href={`/order/${o.id}`} className="a-link">고객 화면 ↗</Link></>}>
      <div className="mb-3 flex items-center gap-2"><Pill tone={ORDER_META[o.status]?.tone}>{ORDER_META[o.status]?.label ?? o.status}</Pill>
        {o.status !== "paid" && <span className="a-muted text-[12px]">결제 완료 주문만 항목 상태를 바꿀 수 있어요</span>}</div>
      {tableMissing(transRes.error) && <p className="a-muted mb-3 rounded-md bg-[var(--a-hover)] p-2 text-[12px]">0037 마이그레이션이 아직 적용되지 않아 상태 변경이 꺼져 있어요.</p>}
      <ul className="flex flex-col gap-3">
        {items.map((it) => {
          const opts: StatusOption[] = o.status !== "paid" ? [] : transitions.filter((x) => x.from_status === it.status)
            .map((x) => ({ to: x.to_status, kind: x.kind, label: pLabel(x.to_status) }));
          const stage = PROXY_STAGE[it.status];
          return (
            <li key={it.id} className="a-panel p-3">
              <div className="mb-2 flex items-center gap-2">
                <Thumb src={it.external_items?.images?.[0]} />
                <div className="min-w-0 flex-1">
                  <Link href={`/proxy/${it.id}`} className="a-link block truncate">{it.external_items?.title ?? "상품"}</Link>
                  <span className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <Pill tone={PROXY_META[it.status]?.tone}>{pLabel(it.status)}</Pill>
                    {stage && <AgeBadge since={it.updated_at} level={agingLevel(it.updated_at, stage, now)} now={now} />}
                    {it.intl_tracking && <span className="a-muted tnum">운송장 {it.intl_tracking}</span>}
                  </span>
                </div>
              </div>
              {["completed", "cancelled"].includes(it.status) ? <p className="a-faint text-[12px]">끝난 항목이에요.</p>
                : <OrderStatusForm key={`${it.id}-${it.status}`} id={it.id} options={opts} />}
            </li>
          );
        })}
      </ul>
      <h3 className="mb-1.5 mt-5 text-[12px] font-semibold">운영 기록</h3>
      {acts.length ? (
        <ul className="flex flex-col gap-1 text-[12px]">
          {acts.map((a) => (
            <li key={a.id} className="a-muted">
              <span className="a-faint tnum mr-1.5">{fmtDate(a.created_at)}</span>{a.profiles?.nickname ?? "시스템"} ·{" "}
              {a.action === "order_status" ? `${pLabel(String(a.detail.from))} → ${pLabel(String(a.detail.to))}` : a.action}
              {a.detail.note && <span> · {a.detail.note}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="a-faint text-[12px]">기록이 없어요.</p>}
    </DetailSheet>
  );
}
