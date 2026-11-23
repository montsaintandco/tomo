import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, Thumb, PROXY_META, fmtDate, money } from "@/components/admin/ui";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import QuoteForm from "@/components/QuoteForm";
import ProxyActions from "@/components/ProxyActions";
import Link from "next/link";
import { rows as safeRows } from "@/lib/safe";
import { loadCancelPreviews } from "@/lib/refunds";

const OPEN = ["requested", "quoted", "approved", "paid", "purchasing", "center_received", "shipped_international", "delivered"];
const FILTERS = [
  { value: "", label: "진행 중" }, { value: "action", label: "처리 필요" }, { value: "requested", label: "견적 대기" },
  { value: "quoted", label: "승인 대기" }, { value: "purchasing", label: "구매 진행" }, { value: "cancelreq", label: "취소 요청" },
  { value: "done", label: "완료·취소" },
];
const BUNDLE = /\[묶음배송 희망\]|\[まとめて発送希望\]/;
const DONE = ["completed", "cancelled"];

// 대행 요청 큐 — 행을 펼치면 견적 폼(요청·견적 단계) 또는 상태 전이 버튼
export default async function AdminProxyPage(props: { searchParams: Promise<{ f?: string }> }) {
  const { f = "" } = await props.searchParams;
  const supabase = await createServerSupabase();
  let q = supabase.from("proxy_requests")
    .select(`id, status, note, order_id, quote_item_price, quote_total, created_at,
      external_items(source, source_id, title, price, images), profiles!proxy_requests_user_id_fkey(nickname)`)
    .order("created_at", { ascending: true }).limit(150);
  // 고객 취소 요청(0025 컬럼) — 미적용이면 빈 목록
  let cancelReqIds: string[] = [];
  if (f === "cancelreq") {
    const cr = await supabase.from("proxy_requests").select("id").eq("status", "paid").not("cancel_requested_at", "is", null).limit(150);
    cancelReqIds = (safeRows(cr) as { id: string }[]).map((x) => x.id);
  }
  if (f === "cancelreq") q = q.in("id", cancelReqIds.length ? cancelReqIds : ["00000000-0000-0000-0000-000000000000"]);
  else if (f === "done") q = q.in("status", ["completed", "cancelled"]);
  else if (f === "action") q = q.in("status", Object.keys(PROXY_META).filter((k) => PROXY_META[k].action));
  else if (f) q = q.eq("status", f);
  else q = q.in("status", OPEN);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; status: string; note: string; order_id: string | null; quote_item_price: number | null; quote_total: number | null; created_at: string;
    external_items: { source: string; source_id: string; title: string; price: number; images: string[] } | null; profiles: { nickname: string } | null;
  }[];

  // 취소·환불 보조 정보(0025) — 별도 조회라 컬럼이 없어도 목록은 그대로
  const extraRes = rows.length
    ? await supabase.from("proxy_requests").select("id, cancel_requested_at, cancel_reason, refund_amount").in("id", rows.map((r) => r.id))
    : { data: [], error: null };
  const extra = Object.fromEntries((safeRows(extraRes) as { id: string; cancel_requested_at: string | null; cancel_reason: string | null; refund_amount: number | null }[]).map((x) => [x.id, x]));
  const previews = await loadCancelPreviews(supabase, rows.filter((r) => r.order_id && !DONE.includes(r.status)).map((r) => r.order_id!));

  return (
    <>
      <PageHeader title="대행 요청" sub="접수순. 견적 → 고객 승인 → 결제 확인 → 현지 구매 → 센터 입고 → 국제 발송 → 배송" />
      <FilterTabs base="/admin/proxy" param="f" options={FILTERS} current={f} />
      <Panel>
        <Table head={["상품", "신청자", "요청", "원가", "견적", "상태", "접수", ""]} empty="해당하는 요청이 없어요">
          {rows.map((r) => {
            const it = r.external_items;
            const editable = r.status === "requested" || r.status === "quoted";
            return (
              <tr key={r.id} className="align-top">
                <td>
                  <span className="flex items-center gap-2">
                    <Thumb src={it?.images?.[0]} />
                    <span className="min-w-0">
                      <Link href={`/proxy/${r.id}`} className="a-link block max-w-[220px] truncate">{it?.title ?? "상품"}</Link>
                      <span className="a-muted block text-[12px]">{it ? SOURCE_LABEL[it.source as MarketSource] : ""}{r.order_id && <Link href={`/order/${r.order_id}`} className="a-link ml-1.5">주문 ↗</Link>}</span>
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap">{r.profiles?.nickname}</td>
                <td className="max-w-[200px]">
                  {BUNDLE.test(r.note) && <Pill tone="navy">묶음</Pill>}
                  <span className="a-muted block text-[12px]">{r.note.replace(BUNDLE, "").trim()}</span>
                </td>
                <td className="tnum whitespace-nowrap">{it ? money(it.price, "JPY") : "—"}</td>
                <td className="tnum whitespace-nowrap">{r.quote_total != null ? money(r.quote_total, "JPY") : <span className="a-faint">—</span>}</td>
                <td>
                  <Pill tone={PROXY_META[r.status]?.tone}>{PROXY_META[r.status]?.label ?? r.status}</Pill>
                  {r.status === "paid" && extra[r.id]?.cancel_requested_at && <span className="mt-1 block"><Pill tone="red">취소 요청</Pill></span>}
                  {r.status === "cancelled" && extra[r.id]?.refund_amount != null && <span className="a-muted tnum mt-1 block text-[11px]">환불 {extra[r.id]!.refund_amount!.toLocaleString("en-US")}</span>}
                  {extra[r.id]?.cancel_reason && <span className="a-muted mt-1 block max-w-[160px] text-[11px]">{extra[r.id]!.cancel_reason}</span>}
                </td>
                <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at)}</td>
                <td className="min-w-[260px]">
                  {!DONE.includes(r.status) && (
                    <details>
                      <summary className="a-link text-[12px]">{editable ? "견적 ▾" : "처리 ▾"}</summary>
                      <div className="reveal mt-2 flex flex-col gap-2">
                        {editable && <QuoteForm id={r.id} defaultItemPrice={r.quote_item_price ?? it?.price ?? 0} quoted={r.status === "quoted"} total={r.quote_total} />}
                        <ProxyActions id={r.id} status={r.status} isOwner={false} isAdmin lang="ko"
                          cancelRequestedAt={extra[r.id]?.cancel_requested_at ?? null} cancelReason={extra[r.id]?.cancel_reason ?? null}
                          refundPreview={previews[r.id] ?? null} />
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </>
  );
}
