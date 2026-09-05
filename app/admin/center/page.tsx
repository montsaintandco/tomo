import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, TX_META, fmtDate } from "@/components/admin/ui";
import TxActions from "@/components/TxActions";
import Link from "next/link";

type Row = {
  id: string; status: string; center: string | null; domestic_tracking: string | null; is_cross_border: boolean; meetup: boolean; updated_at: string;
  listings: { title: string } | null; buyer: { nickname: string } | null; seller: { nickname: string } | null;
};

// 센터 큐 — 서울/나리타별 입고 확인·국제 발송을 행에서 바로 처리 (운송장 입력 포함)
export default async function AdminCenterPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("transactions")
    .select(`id, status, center, domestic_tracking, is_cross_border, meetup, updated_at, listings(title),
      buyer:profiles!transactions_buyer_id_fkey(nickname), seller:profiles!transactions_seller_id_fkey(nickname)`)
    .in("status", ["shipped_to_center", "center_received"]).order("updated_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="센터" sub="센터로 발송된 거래는 입고 확인, 입고된 거래는 국제 운송장과 함께 발송 처리" />
      {(["SEOUL", "NARITA"] as const).map((c) => {
        const items = rows.filter((r) => r.center === c);
        return (
          <Panel key={c} title={c === "SEOUL" ? "서울 센터" : "나리타 센터"} count={items.length} className="mb-4">
            <Table head={["상품", "판매자 → 구매자", "국내 운송장", "상태", "갱신", "처리"]} empty="대기 중인 거래 없음">
              {items.map((r) => (
                <tr key={r.id} className="align-top">
                  <td><Link href={`/transactions/${r.id}`} className="a-link block max-w-[240px] truncate">{r.listings?.title ?? "—"}</Link></td>
                  <td className="whitespace-nowrap">{r.seller?.nickname} <span className="a-faint">→</span> {r.buyer?.nickname}</td>
                  <td className="tnum">{r.domestic_tracking ?? <span className="a-faint">—</span>}</td>
                  <td><Pill tone={TX_META[r.status]?.tone}>{TX_META[r.status]?.label}</Pill></td>
                  <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                  <td className="min-w-[240px]"><TxActions txId={r.id} status={r.status} isCrossBorder={r.is_cross_border} meetup={r.meetup} role="admin" lang="ko" /></td>
                </tr>
              ))}
            </Table>
          </Panel>
        );
      })}
    </>
  );
}
