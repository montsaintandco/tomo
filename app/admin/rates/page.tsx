import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import RateForm from "@/components/RateForm";
import Link from "next/link";
import { redirect } from "next/navigation";

// 환율 수동 보정 — 배치가 멈추거나 급변동일 때. 표시용 참고 환율이라 정산 금액엔 영향 없음
export default async function AdminRatesPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/rates");
  if (!viewer.isAdmin) redirect("/");
  const { data } = await supabase.from("exchange_rates").select("pair, rate, updated_at").order("pair");

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">환율</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>
      <p className="mb-4 rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
        상품 가격 환산에 쓰는 참고 환율이에요. JPY_KRW = 1엔당 원, KRW_JPY = 1원당 엔.
      </p>
      <div className="flex flex-col gap-3">
        {(data ?? []).map((r) => (
          <RateForm key={r.pair} pair={r.pair} rate={Number(r.rate)} updatedAt={r.updated_at} />
        ))}
      </div>
    </main>
  );
}
