// 환율 자동 갱신(0042, Ren 결정 6). 원천 = 에어쉽 공개 /api/fx-rate(관세청 주간 고시환율, 에어쉽과 같은 원천).
// 엔→원(JPY_KRW, 원화 청구에 쓰는 값)은 에어쉽과 같은 공식: 고시환율 × (1 + FX_MARKUP). 에어쉽 NEGO_FX_SPREAD_JPY 와 같은 값으로 맞춘다(Ren 2026-11-27 「에어쉽이랑 똑같이」).
// 원→엔(KRW_JPY)은 화면 참고 환산뿐(청구는 항상 KRW)이라 가산 없이 고시환율 역수. 가산 수치는 고객 화면에 드러내지 않는다.
// 지금 적용된 값보다 3% 넘게 바뀌면 적용하지 않고 보류 + 운영자 알림(cron_runs job='rates', 텔레그램 「[TOMO]」).
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyOps } from "./notify-ops";

export const FX_SOURCE = "https://airship.click/api/fx-rate";
export const FX_MARKUP = 0.06;
export const FX_MAX_CHANGE = 0.03;

export type FxDecision = { jpyKrw: number; krwJpy: number; change: number | null; hold: boolean };

/** 원천 값(1엔당 원) → 적용할 두 값과 보류 여부. current 가 없으면 비교 없이 적용 */
export function decideRate(krwPerJpyRaw: number, current: number | null): FxDecision {
  const jpyKrw = Math.round(krwPerJpyRaw * (1 + FX_MARKUP) * 10000) / 10000;
  const krwJpy = Math.round((1 / krwPerJpyRaw) * 1e6) / 1e6;
  const change = current && current > 0 ? jpyKrw / current - 1 : null;
  return { jpyKrw, krwJpy, change, hold: change !== null && Math.abs(change) > FX_MAX_CHANGE };
}

export type FxRun = { ok: boolean; status: "applied" | "held" | "unchanged" | "failed"; detail: Record<string, unknown> };

async function fetchSource(): Promise<{ krwPerJpy: number; date: string | null }> {
  const r = await fetch(FX_SOURCE, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  const d = (await r.json().catch(() => null)) as { ok?: boolean; krwPerUsd?: number; usdPerJpy?: number; aplyBgnDt?: string } | null;
  const v = Number(d?.krwPerUsd) * Number(d?.usdPerJpy);
  // 1엔 = 3~30원 밖이면 원천 이상으로 본다
  if (!r.ok || !d?.ok || !Number.isFinite(v) || v < 3 || v > 30) throw new Error(`source ${r.status} ${JSON.stringify(d).slice(0, 120)}`);
  return { krwPerJpy: v, date: d.aplyBgnDt ?? null };
}

/** force = 운영자가 보류된 값을 확인하고 적용(3% 검사 생략). admin 은 service_role 클라이언트 */
export async function refreshRates(admin: SupabaseClient, opts: { force?: boolean; by?: string } = {}): Promise<FxRun> {
  let run: FxRun;
  try {
    const src = await fetchSource();
    const { data: cur } = await admin.from("exchange_rates").select("rate").eq("pair", "JPY_KRW").maybeSingle();
    const current = cur ? Number(cur.rate) : null;
    const d = decideRate(src.krwPerJpy, current);
    const detail = { source_date: src.date, raw: src.krwPerJpy, current, jpy_krw: d.jpyKrw, krw_jpy: d.krwJpy, change: d.change, by: opts.by ?? "cron" };
    if (d.hold && !opts.force) {
      run = { ok: true, status: "held", detail };
    } else if (current === d.jpyKrw) {
      run = { ok: true, status: "unchanged", detail };
    } else {
      const now = new Date().toISOString();
      const a = await admin.from("exchange_rates").update({ rate: d.jpyKrw, updated_at: now }).eq("pair", "JPY_KRW");
      const b = await admin.from("exchange_rates").update({ rate: d.krwJpy, updated_at: now }).eq("pair", "KRW_JPY");
      if (a.error || b.error) throw new Error(`update ${a.error?.message ?? b.error?.message}`);
      run = { ok: true, status: "applied", detail };
    }
  } catch (e) {
    run = { ok: false, status: "failed", detail: { error: e instanceof Error ? e.message.slice(0, 300) : String(e), by: opts.by ?? "cron" } };
  }
  await admin.from("cron_runs").insert({ job: "rates", ok: run.ok, detail: { status: run.status, ...run.detail } });
  if (run.status === "held") {
    const p = ((run.detail.change as number) * 100).toFixed(1);
    await notifyOps(`[TOMO] 환율 자동 갱신 보류: JPY_KRW ${run.detail.current} → ${run.detail.jpy_krw} (${p}%). 어드민 환율에서 확인 후 적용`);
  } else if (run.status === "failed") {
    await notifyOps(`[TOMO] 환율 자동 갱신 실패: ${run.detail.error}`);
  }
  return run;
}
