import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Table, fmtDate } from "@/components/admin/ui";
import AdminToggle from "@/components/AdminToggle";
import Link from "next/link";

const HEART = "M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z";

// 후기 모더레이션 — 최근 100건, 부적절 후기 삭제 (RLS: admin deletes reviews)
export default async function AdminReviewsPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("reviews")
    .select("id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(nickname), transactions(id, listings(title))")
    .order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as {
    id: string; rating: number; comment: string | null; created_at: string;
    reviewer: { nickname: string } | null; transactions: { id: string; listings: { title: string } | null } | null;
  }[];

  return (
    <>
      <PageHeader title="후기" sub="삭제하면 신뢰온도 반영분은 되돌리지 않아요 (온도는 후기 시점에 이미 계산됨)" />
      <Panel>
        <Table head={["작성자", "평점", "내용", "거래", "작성", ""]} empty="후기가 없어요">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="whitespace-nowrap">{r.reviewer?.nickname ?? "—"}</td>
              <td>
                <span className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <svg key={n} viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden><path d={HEART} fill={n <= r.rating ? "#E2807F" : "none"} stroke={n <= r.rating ? "#E2807F" : "#9CA3AF"} strokeWidth={1.8} /></svg>
                  ))}
                </span>
              </td>
              <td className="max-w-[360px] whitespace-pre-wrap">{r.comment || <span className="a-faint">—</span>}</td>
              <td>{r.transactions ? <Link href={`/transactions/${r.transactions.id}`} className="a-link block max-w-[200px] truncate">{r.transactions.listings?.title ?? "거래"}</Link> : "—"}</td>
              <td className="a-faint tnum whitespace-nowrap">{fmtDate(r.created_at)}</td>
              <td className="text-right"><AdminToggle label="삭제" danger confirmText="이 후기를 삭제할까요?" action={{ table: "reviews", id: r.id, del: true }} /></td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
