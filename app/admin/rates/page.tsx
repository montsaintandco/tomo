import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel } from "@/components/admin/ui";
import RateForm from "@/components/RateForm";

// 환율 수동 보정 — 표시용 참고 환율. 정산 금액엔 영향 없음
export default async function AdminRatesPage() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("exchange_rates").select("pair, rate, updated_at").order("pair");
  return (
    <>
      <PageHeader title="환율" sub="상품 가격 환산용 참고 환율. JPY_KRW = 1엔당 원, KRW_JPY = 1원당 엔. 배치가 멈추거나 급변동일 때만 손대세요" />
      <Panel className="max-w-xl">
        <div className="flex flex-col gap-2 p-3">
          {(data ?? []).map((r) => <RateForm key={r.pair} pair={r.pair} rate={Number(r.rate)} updatedAt={r.updated_at} />)}
        </div>
      </Panel>
    </>
  );
}
