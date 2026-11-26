import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, Pager, fmtDate, type Tone } from "@/components/admin/ui";
import { pageOf } from "@/components/admin/paging";
import { rows, tableMissing } from "@/lib/safe";

// 운영자 활동 기록 (0025 admin_actions) — 돈·취소·정지·숨김. DB 함수가 남기고 화면은 읽기만
const ACTION: Record<string, { label: string; tone: Tone; group: string }> = {
  tx_cancel: { label: "거래 취소·환불", tone: "red", group: "money" },
  tx_force_complete: { label: "강제 구매확정", tone: "blue", group: "money" },
  dispute_cancelled: { label: "분쟁 환불", tone: "red", group: "money" },
  dispute_completed: { label: "분쟁 정산", tone: "green", group: "money" },
  proxy_cancel: { label: "대행 취소", tone: "red", group: "money" },
  payout_sent: { label: "출금 송금", tone: "green", group: "money" },          // 0026 (묶음 B)
  payout_rejected: { label: "출금 거절", tone: "amber", group: "money" },
  ledger_adjust: { label: "정산 원장 조정", tone: "amber", group: "money" },
  user_set: { label: "회원 권한·정지", tone: "amber", group: "people" },
  listing_hidden: { label: "상품 숨김", tone: "gray", group: "listing" },
  listing_update: { label: "상품 제목·가격 수정", tone: "amber", group: "listing" },   // 0037
  order_status: { label: "주문 상태 변경", tone: "blue", group: "order" },                // 0037
  report_resolved: { label: "신고 처리", tone: "green", group: "people" },   // 0033
  report_dismissed: { label: "신고 기각", tone: "gray", group: "people" },
  report_open: { label: "신고 다시 열기", tone: "amber", group: "people" },
};
const GROUPS: Record<string, string[]> = {
  money: Object.keys(ACTION).filter((k) => ACTION[k].group === "money"),
  order: ["order_status"],
  people: ["user_set", "report_resolved", "report_dismissed", "report_open"],
  listing: ["listing_hidden", "listing_update"],
};
const FILTERS = [{ value: "", label: "전체" }, { value: "money", label: "돈·취소" }, { value: "order", label: "주문 상태" }, { value: "people", label: "회원·신고" }, { value: "listing", label: "상품" }];

const LINK: Record<string, (id: string) => string> = {
  transaction: (id) => `/transactions/${id}`, proxy_request: (id) => `/proxy/${id}`,
  user: (id) => `/profile/${id}`, listing: (id) => `/listings/${id}`, payout: () => "/admin/payouts", report: () => "/admin/reports?status=all",
};
const TARGET: Record<string, string> = { transaction: "거래", proxy_request: "대행", user: "회원", listing: "상품", payout: "출금", report: "신고" };
const KEY: Record<string, string> = {
  reason: "사유", note: "메모", amount: "환불", default: "계산값", cap: "상한", currency: "통화", from: "이전 상태",
  suspended: "정지", admin: "운영자", hidden: "숨김", refund_id: "환불", order_id: "주문",
  to: "바꾼 상태", kind: "종류", tracking: "운송장", title_from: "이전 제목", title: "제목", price_from: "이전 가격", price: "가격", status: "상태",
};

function detailText(d: Record<string, unknown>): string {
  return Object.entries(d ?? {})
    .filter(([k, v]) => v != null && v !== "" && k !== "refund_id" && k !== "order_id")
    .map(([k, v]) => `${KEY[k] ?? k}: ${typeof v === "boolean" ? (v ? "예" : "아니오") : String(v)}`)
    .join(" · ");
}

type Act = { id: number; action: string; target_type: string; target_id: string; detail: Record<string, unknown>; created_at: string; profiles: { nickname: string } | null };

export default async function AdminActivityPage(props: { searchParams: Promise<{ g?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const g = GROUPS[sp.g ?? ""] ? sp.g! : "";
  const { page, from, to, size } = pageOf(sp.page);
  const params = { g: g || undefined, page: page > 1 ? String(page) : undefined };
  const supabase = await createServerSupabase();
  let q = supabase.from("admin_actions")
    .select("id, action, target_type, target_id, detail, created_at, profiles!admin_actions_admin_id_fkey(nickname)", { count: "exact" })
    .order("created_at", { ascending: false }).range(from, to);
  if (GROUPS[g]) q = q.in("action", GROUPS[g]);
  const res = await q;
  const list = rows(res) as unknown as Act[];

  return (
    <>
      <PageHeader title="활동 기록" sub="운영자가 한 취소·환불·정산·주문 상태·상품 수정·정지·숨김. 최근순" />
      <FilterTabs base="/admin/activity" param="g" options={FILTERS} current={g} keep={params} />
      {tableMissing(res.error) && <Panel className="mb-4"><p className="a-muted p-4 text-[13px]">활동 기록(0025 마이그레이션)이 아직 적용되지 않았어요.</p></Panel>}
      <Panel>
        <Table head={["시각", "운영자", "작업", "대상", "내용"]} empty="기록이 없어요">
          {list.map((a) => {
            const meta = ACTION[a.action];
            const href = LINK[a.target_type]?.(a.target_id);
            return (
              <tr key={a.id} className="align-top">
                <td className="a-faint tnum whitespace-nowrap">{fmtDate(a.created_at)}</td>
                <td className="whitespace-nowrap">{a.profiles?.nickname ?? "시스템"}</td>
                <td><Pill tone={meta?.tone}>{meta?.label ?? a.action}</Pill></td>
                <td className="whitespace-nowrap">
                  {href ? <Link href={href} className="a-link">{TARGET[a.target_type] ?? a.target_type} {a.target_id.slice(0, 8)}</Link>
                    : <span>{a.target_type} {a.target_id.slice(0, 8)}</span>}
                </td>
                <td className="max-w-[420px] text-[12px]"><span className="a-muted break-words">{detailText(a.detail)}</span></td>
              </tr>
            );
          })}
        </Table>
        <Pager base="/admin/activity" params={params} page={page} size={size} total={res.count ?? null} shown={list.length} />
      </Panel>
    </>
  );
}
