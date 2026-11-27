import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, fmtDate, money } from "@/components/admin/ui";
import TxActions from "@/components/TxActions";
import Link from "next/link";
import { rows as safeRows } from "@/lib/safe";
import ReleaseHoldButton from "@/components/admin/ReleaseHoldButton";

const REFUND: Record<string, { label: string; tone: "amber" | "red" | "green" }> = {
  pending: { label: "환불 대기", tone: "amber" }, failed: { label: "환불 실패", tone: "red" }, done: { label: "환불 완료", tone: "green" },
};

// 분쟁 큐 — 사유 확인 → 정산(완료) / 환불(취소). 행을 펼치면 처리 폼. 환불 취소는 /api/admin/cancel → refunds → Stripe 환불(실패하면 /admin/refunds)
export default async function AdminDisputesPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("transactions")
    .select(`id, status, item_price, currency, is_cross_border, meetup, dispute_reason, dispute_resolution, updated_at, listing_id,
      listings(title, status), buyer:profiles!transactions_buyer_id_fkey(nickname), seller:profiles!transactions_seller_id_fkey(nickname)`)
    .or("status.eq.disputed,dispute_resolution.not.is.null")
    .order("updated_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as {
    id: string; status: string; item_price: number; currency: string; is_cross_border: boolean; meetup: boolean;
    dispute_reason: string | null; dispute_resolution: string | null; updated_at: string; listing_id: string;
    listings: { title: string; status: string } | null; buyer: { nickname: string } | null; seller: { nickname: string } | null;
  }[];
  const refundRes = await supabase.from("refunds").select("transaction_id, status").eq("kind", "tx").in("transaction_id", rows.map((r) => r.id));
  const refundOf = Object.fromEntries((safeRows(refundRes) as { transaction_id: string; status: string }[]).map((f) => [f.transaction_id, f.status]));
  const open = rows.filter((r) => r.status === "disputed");
  const closed = rows.filter((r) => r.status !== "disputed");

  const Row = ({ r, expandable }: { r: (typeof rows)[number]; expandable: boolean }) => (
    <tr key={r.id} className="align-top">
      <td>
        <Link href={`/transactions/${r.id}`} className="a-link block max-w-[240px] truncate">{r.listings?.title ?? "—"}</Link>
        <span className="a-muted block text-[12px]">{r.buyer?.nickname} → {r.seller?.nickname} · {r.meetup ? "만남" : r.is_cross_border ? "국제" : "국내"}</span>
      </td>
      <td className="tnum whitespace-nowrap">{money(r.item_price, r.currency)}</td>
      <td className="max-w-[320px]">
        <p className="whitespace-pre-wrap">{r.dispute_reason}</p>
        {r.dispute_resolution && <p className="a-muted mt-1 text-[12px]">처리: {r.dispute_resolution}</p>}
      </td>
      <td><Pill tone={r.status === "disputed" ? "red" : r.status === "completed" ? "green" : "gray"}>{r.status === "disputed" ? "처리 필요" : r.status === "completed" ? "정산" : "환불"}</Pill>
        {refundOf[r.id] && <span className="mt-1 block"><Pill tone={REFUND[refundOf[r.id]]?.tone}>{REFUND[refundOf[r.id]]?.label ?? refundOf[r.id]}</Pill></span>}
        {r.listings?.status === "held" && <span className="mt-1 block"><Pill tone="red">상품 보류</Pill></span>}</td>
      <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at)}</td>
      <td className="min-w-[280px]">
        {r.listings?.status === "held" && <ReleaseHoldButton listingId={r.listing_id} title={r.listings.title} />}
        {expandable && (
          <details>
            <summary className="a-link text-[12px]">처리 ▾</summary>
            <div className="reveal mt-2"><TxActions txId={r.id} status={r.status} isCrossBorder={r.is_cross_border} meetup={r.meetup} role="admin" lang="ko" /></div>
          </details>
        )}
      </td>
    </tr>
  );

  return (
    <>
      <PageHeader title="분쟁" sub="당사자가 연 분쟁을 정산(완료) 또는 환불(취소)로 닫아요. 환불 취소 때 판매자가 아직 안 보낸 상품은 다시 판매중, 보낸 뒤(발송·센터·배송)면 「보류」가 돼요. 반송을 확인한 뒤 「보류 해제」를 누르세요" />
      <Panel title="처리 필요" count={open.length} className="mb-4">
        <Table head={["거래", "금액", "사유", "상태", "갱신", ""]} empty="처리할 분쟁이 없어요">
          {open.map((r) => <Row key={r.id} r={r} expandable />)}
        </Table>
      </Panel>
      <Panel title="처리 완료" count={closed.length}>
        <Table head={["거래", "금액", "사유", "결과", "갱신", ""]} empty="아직 없음">
          {closed.map((r) => <Row key={r.id} r={r} expandable={false} />)}
        </Table>
      </Panel>
    </>
  );
}
