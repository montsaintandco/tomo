import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, fmtDate, money } from "@/components/admin/ui";
import TxActions from "@/components/TxActions";
import Link from "next/link";

// 분쟁 큐 — 사유 확인 → 정산(완료) / 환불(취소). 행을 펼치면 처리 폼. Stripe 환불은 키 투입 후 웹훅에서
export default async function AdminDisputesPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("transactions")
    .select(`id, status, item_price, currency, is_cross_border, meetup, dispute_reason, dispute_resolution, updated_at,
      listings(title), buyer:profiles!transactions_buyer_id_fkey(nickname), seller:profiles!transactions_seller_id_fkey(nickname)`)
    .or("status.eq.disputed,dispute_resolution.not.is.null")
    .order("updated_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as {
    id: string; status: string; item_price: number; currency: string; is_cross_border: boolean; meetup: boolean;
    dispute_reason: string | null; dispute_resolution: string | null; updated_at: string;
    listings: { title: string } | null; buyer: { nickname: string } | null; seller: { nickname: string } | null;
  }[];
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
      <td><Pill tone={r.status === "disputed" ? "red" : r.status === "completed" ? "green" : "gray"}>{r.status === "disputed" ? "처리 필요" : r.status === "completed" ? "정산" : "환불"}</Pill></td>
      <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at)}</td>
      <td className="min-w-[280px]">
        {expandable && (
          <details>
            <summary className="a-link text-[12px]">처리 ▾</summary>
            <div className="mt-2"><TxActions txId={r.id} status={r.status} isCrossBorder={r.is_cross_border} meetup={r.meetup} role="admin" lang="ko" /></div>
          </details>
        )}
      </td>
    </tr>
  );

  return (
    <>
      <PageHeader title="분쟁" sub="당사자가 연 분쟁을 정산(완료) 또는 환불(취소)로 닫아요. 환불 취소는 상품을 다시 판매중으로 되돌립니다" />
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
