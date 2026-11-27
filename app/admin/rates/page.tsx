import { createServerSupabase } from "@/lib/supabase/server";
import { PageHeader, Panel, Pill, fmtDate } from "@/components/admin/ui";
import RateForm from "@/components/RateForm";
import RatesCronButton from "@/components/admin/RatesCronButton";
import { rows as safeRows } from "@/lib/safe";

type Run = { id: number; ok: boolean; created_at: string; detail: { status?: string; current?: number; jpy_krw?: number; krw_jpy?: number; change?: number | null; source_date?: string; error?: string; by?: string } };
const ST: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  applied: { label: "적용", tone: "green" }, held: { label: "보류", tone: "amber" }, unchanged: { label: "변동 없음", tone: "gray" }, failed: { label: "실패", tone: "red" },
};

// 환율 — 매일 09:30 자동 갱신(0042, 에어쉽과 같은 관세청 고시환율). 3% 넘게 바뀌면 보류하고 여기서 확인 후 적용
export default async function AdminRatesPage() {
  const supabase = await createServerSupabase();
  const [{ data }, runRes] = await Promise.all([
    supabase.from("exchange_rates").select("pair, rate, updated_at").order("pair"),
    supabase.from("cron_runs").select("id, ok, created_at, detail").eq("job", "rates").order("id", { ascending: false }).limit(10),
  ]);
  const runs = safeRows(runRes) as Run[];
  const last = runs[0];
  return (
    <>
      <PageHeader title="환율" sub="상품 가격 환산·원화 청구용. JPY_KRW = 1엔당 원, KRW_JPY = 1원당 엔. 매일 09:30 자동 갱신(관세청 주간 고시환율), 지금 값보다 3% 넘게 바뀌면 보류" />
      {last?.detail.status === "held" && (
        <Panel className="mb-3 max-w-xl">
          <div className="flex flex-wrap items-center gap-2 p-3 text-[13px]">
            <Pill tone="amber">보류</Pill>
            <span className="tnum">JPY_KRW {last.detail.current} → {last.detail.jpy_krw} ({((last.detail.change ?? 0) * 100).toFixed(1)}%) · KRW_JPY {last.detail.krw_jpy} · 고시 {last.detail.source_date}</span>
            <RatesCronButton force label="이 값으로 적용" />
          </div>
        </Panel>
      )}
      <Panel className="max-w-xl" title="현재 환율" actions={<RatesCronButton label="지금 갱신" />}>
        <div className="flex flex-col gap-2 p-3">
          {(data ?? []).map((r) => <RateForm key={r.pair} pair={r.pair} rate={Number(r.rate)} updatedAt={r.updated_at} />)}
        </div>
      </Panel>
      {runs.length > 0 && (
        <Panel className="mt-3 max-w-xl" title="자동 갱신 기록">
          <ul className="flex flex-col gap-1 p-3 text-[12px]">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="a-faint tnum">{fmtDate(r.created_at)}</span>
                <Pill tone={ST[r.detail.status ?? ""]?.tone}>{ST[r.detail.status ?? ""]?.label ?? r.detail.status}</Pill>
                <span className="a-muted tnum">{r.detail.error ?? `${r.detail.current ?? "—"} → ${r.detail.jpy_krw ?? "—"}`}</span>
                <span className="a-faint">{r.detail.by?.startsWith("admin") ? "운영자" : "자동"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
