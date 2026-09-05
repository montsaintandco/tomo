import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, Pill, Kpi, TX_META, PROXY_META, fmtDate, money, todayIso } from "@/components/admin/ui";
import Link from "next/link";

// 대시보드 — 숫자 6개 + "지금 처리해야 할 것" 인박스 (Linear Inbox 문법)
export default async function AdminHome() {
  const supabase = await createServerSupabase();
  const today = todayIso();
  const cnt = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [activeListings, users, openTx, disputes, proxyWait, centerWait, newListings, newUsers, paidOrders, disputeRows, proxyRows, centerRows] = await Promise.all([
    cnt(supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active").eq("hidden", false)),
    cnt(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("suspended", false)),
    cnt(supabase.from("transactions").select("id", { count: "exact", head: true }).not("status", "in", "(completed,cancelled,pending_payment)")),
    cnt(supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "disputed")),
    cnt(supabase.from("proxy_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "approved", "paid", "purchasing", "center_received"])),
    cnt(supabase.from("transactions").select("id", { count: "exact", head: true }).in("status", ["shipped_to_center", "center_received"])),
    cnt(supabase.from("listings").select("id", { count: "exact", head: true }).gte("created_at", today)),
    cnt(supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", today)),
    cnt(supabase.from("proxy_orders").select("id", { count: "exact", head: true }).eq("status", "paid").gte("updated_at", today)),
    supabase.from("transactions").select("id, status, item_price, currency, updated_at, dispute_reason, listings(title), buyer:profiles!transactions_buyer_id_fkey(nickname)")
      .eq("status", "disputed").order("updated_at", { ascending: false }).limit(5),
    supabase.from("proxy_requests").select("id, status, created_at, external_items(title), profiles!proxy_requests_user_id_fkey(nickname)")
      .in("status", ["requested", "approved", "paid", "purchasing", "center_received"]).order("created_at", { ascending: true }).limit(6),
    supabase.from("transactions").select("id, status, center, updated_at, listings(title)")
      .in("status", ["shipped_to_center", "center_received"]).order("updated_at", { ascending: true }).limit(6),
  ]);

  type Row = { id: string; status: string; updated_at?: string; created_at?: string; item_price?: number; currency?: string; center?: string | null; dispute_reason?: string | null;
    listings?: { title: string } | null; external_items?: { title: string } | null; buyer?: { nickname: string } | null; profiles?: { nickname: string } | null };
  const dRows = (disputeRows.data ?? []) as unknown as Row[];
  const pRows = (proxyRows.data ?? []) as unknown as Row[];
  const cRows = (centerRows.data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="대시보드" sub={`오늘 신규 상품 ${newListings} · 신규 가입 ${newUsers} · 결제된 주문 ${paidOrders}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="판매중 상품" value={activeListings} href="/admin/listings" />
        <Kpi label="사용자" value={users} href="/admin/users" />
        <Kpi label="진행 중 거래" value={openTx} href="/admin/transactions?status=open" />
        <Kpi label="분쟁" value={disputes} href="/admin/disputes" alert />
        <Kpi label="대행 처리 필요" value={proxyWait} href="/admin/proxy" alert />
        <Kpi label="센터 대기" value={centerWait} href="/admin/center" alert />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="분쟁" count={disputes} actions={<Link href="/admin/disputes" className="a-link text-[12px]">전체 →</Link>}>
          <Table head={["상품", "구매자", "금액", "사유", "갱신"]} empty="처리할 분쟁이 없어요">
            {dRows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/transactions/${r.id}`} className="a-link block max-w-[180px] truncate">{r.listings?.title ?? "—"}</Link></td>
                <td>{r.buyer?.nickname}</td>
                <td className="tnum">{money(r.item_price ?? 0, r.currency ?? "KRW")}</td>
                <td className="a-muted max-w-[200px] truncate">{r.dispute_reason}</td>
                <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at!)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="대행 요청" count={proxyWait} actions={<Link href="/admin/proxy" className="a-link text-[12px]">전체 →</Link>}>
          <Table head={["상품", "신청자", "상태", "접수"]} empty="처리할 대행이 없어요">
            {pRows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/proxy/${r.id}`} className="a-link block max-w-[220px] truncate">{r.external_items?.title ?? "—"}</Link></td>
                <td>{r.profiles?.nickname}</td>
                <td><Pill tone={PROXY_META[r.status]?.tone}>{PROXY_META[r.status]?.label ?? r.status}</Pill></td>
                <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at!)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title="센터 대기" count={centerWait} actions={<Link href="/admin/center" className="a-link text-[12px]">전체 →</Link>} className="lg:col-span-2">
          <Table head={["센터", "상품", "상태", "갱신"]} empty="센터 대기 거래가 없어요">
            {cRows.map((r) => (
              <tr key={r.id}>
                <td>{r.center === "NARITA" ? "나리타" : "서울"}</td>
                <td><Link href={`/transactions/${r.id}`} className="a-link">{r.listings?.title ?? "—"}</Link></td>
                <td><Pill tone={TX_META[r.status]?.tone}>{TX_META[r.status]?.label ?? r.status}</Pill></td>
                <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.updated_at!)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </>
  );
}
