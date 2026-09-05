import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, FilterTabs, TX_META, fmtDate, money } from "@/components/admin/ui";
import Link from "next/link";

const OPEN = ["paid", "shipped", "shipped_to_center", "center_received", "shipped_international", "delivered"];
const FILTERS = [
  { value: "", label: "전체" }, { value: "open", label: "진행 중" }, { value: "disputed", label: "분쟁" },
  { value: "completed", label: "완료" }, { value: "cancelled", label: "취소" }, { value: "pending_payment", label: "결제 대기" },
];

// 전체 거래 — 에스크로 상태 전부. 행은 거래 상세(운영자는 0010 RLS로 열람·센터 액션)
export default async function AdminTransactionsPage(props: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await props.searchParams;
  const supabase = await createServerSupabase();
  let q = supabase.from("transactions")
    .select("id, status, is_cross_border, meetup, center, item_price, currency, updated_at, listings(title), buyer:profiles!transactions_buyer_id_fkey(nickname), seller:profiles!transactions_seller_id_fkey(nickname)")
    .order("updated_at", { ascending: false }).limit(100);
  if (status === "open") q = q.in("status", OPEN);
  else if (status) q = q.eq("status", status);
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; status: string; is_cross_border: boolean; meetup: boolean; center: string | null; item_price: number; currency: string; updated_at: string;
    listings: { title: string } | null; buyer: { nickname: string } | null; seller: { nickname: string } | null;
  }[];

  return (
    <>
      <PageHeader title="거래" sub="에스크로 거래 전체. 최근 갱신순 100건" />
      <FilterTabs base="/admin/transactions" param="status" options={FILTERS} current={status} />
      <Panel>
        <Table head={["상품", "구매자 → 판매자", "금액", "유형", "상태", "갱신"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/transactions/${r.id}`} className="a-link block max-w-[260px] truncate">{r.listings?.title ?? "—"}</Link></td>
              <td className="whitespace-nowrap">{r.buyer?.nickname} <span className="a-faint">→</span> {r.seller?.nickname}</td>
              <td className="tnum whitespace-nowrap">{money(r.item_price, r.currency)}</td>
              <td className="a-muted whitespace-nowrap">{r.meetup ? "만남" : r.is_cross_border ? `국제 · ${r.center === "NARITA" ? "나리타" : "서울"}` : "국내"}</td>
              <td><Pill tone={TX_META[r.status]?.tone}>{TX_META[r.status]?.label ?? r.status}</Pill></td>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
