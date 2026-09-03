import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice, type Currency } from "@/lib/currency";
import TxActions from "@/components/TxActions";
import Link from "next/link";
import { redirect } from "next/navigation";

// 분쟁 큐 — 당사자가 연 분쟁을 정산(완료) 또는 환불(취소)로 닫는다. Stripe 환불은 키 투입 후 웹훅에서
export default async function AdminDisputesPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/disputes");
  if (!viewer.isAdmin) redirect("/");

  const { data } = await supabase.from("transactions")
    .select(`id, status, item_price, currency, is_cross_border, dispute_reason, dispute_resolution, updated_at,
      listings(title, images),
      buyer:profiles!transactions_buyer_id_fkey(nickname),
      seller:profiles!transactions_seller_id_fkey(nickname)`)
    .or("status.eq.disputed,dispute_resolution.not.is.null")
    .order("updated_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as {
    id: string; status: string; item_price: number; currency: string; is_cross_border: boolean;
    dispute_reason: string | null; dispute_resolution: string | null; updated_at: string;
    listings: { title: string; images: string[] } | null; buyer: { nickname: string } | null; seller: { nickname: string } | null;
  }[];

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-3xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">분쟁 처리</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((tx) => (
          <div key={tx.id} className="card p-3.5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-ink">{tx.listings?.title ?? "상품"}</p>
                <p className="tnum text-[12px] text-ink-soft">
                  {tx.buyer?.nickname} → {tx.seller?.nickname} · {formatPrice(tx.item_price, tx.currency as Currency)} · {tx.is_cross_border ? "국제" : "국내"}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tx.status === "disputed" ? "bg-tomo-coral-deep text-white" : "bg-tomo-navy/5 text-tomo-navy"}`}>
                {tx.status === "disputed" ? "처리 필요" : tx.status === "completed" ? "정산 완료" : "환불 취소"}
              </span>
            </div>
            {tx.dispute_reason && <p className="mb-2 rounded-card bg-tomo-navy/5 p-2.5 text-[12px] leading-relaxed text-ink">사유: {tx.dispute_reason}</p>}
            {tx.dispute_resolution && <p className="mb-2 text-[12px] text-ink-soft">처리: {tx.dispute_resolution}</p>}
            <div className="flex items-center justify-between gap-3">
              <Link href={`/transactions/${tx.id}`} className="press text-[13px] font-bold text-tomo-navy">거래 상세 →</Link>
            </div>
            {tx.status === "disputed" && (
              <div className="mt-3">
                <TxActions txId={tx.id} status={tx.status} isCrossBorder={tx.is_cross_border} role="admin" lang="ko" />
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">분쟁이 없어요</p>}
      </div>
    </main>
  );
}
