"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

// 0057 센터 보조 입력(운영자 세션 rpc). 절차서: docs/aaa/17-shipping-centers.md
const field = "h-8 rounded border border-tomo-navy/15 px-2 text-[13px]";
const btn = "btn h-8 w-fit bg-tomo-navy px-3 text-[12px] text-white";

function useRun() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = async (ask: string, fn: () => Promise<{ error: { message: string } | null; ok?: string }>) => {
    if (!confirm(ask)) return;
    setBusy(true); setErr(""); setMsg("");
    const r = await fn().catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : "실패" } }));
    setBusy(false);
    if (r.error) return setErr(r.error.message);
    if ("ok" in r && r.ok) setMsg(r.ok);
    start(() => router.refresh());
  };
  return { busy: busy || pending, err, msg, run };
}

/** 배송대행 신청(한국 = CarryToJ 신청번호) · 입고 예정 등록(일본 = 재팬비즈 신청서 번호). 일본 센터는 넣는 순간 판매자 주소에 붙고 알림이 간다 */
export function CenterStepForm({ txId, center, current }: { txId: string; center: "SEOUL" | "NARITA"; current: { ref: string | null; memo: string } | null }) {
  const [ref, setRef] = useState(current?.ref ?? "");
  const [memo, setMemo] = useState(current?.memo ?? "");
  const { busy, err, msg, run } = useRun();
  const label = center === "SEOUL" ? "CarryToJ 신청번호" : "재팬비즈 입고 예정 신청서 번호";
  return (
    <div className="mt-2 grid max-w-md gap-1.5 rounded border border-amber-300 bg-amber-50 p-2 text-[12px]">
      <b>{center === "SEOUL" ? (current?.ref ? "배송대행 신청 완료" : "배송대행 신청 필요(CarryToJ)") : (current?.ref ? "입고 예정 등록 완료" : "입고 예정 등록 필요(재팬비즈)")}</b>
      <label>{label}<input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} className={`${field} w-full`} /></label>
      <label>메모(운영자만)<input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} className={`${field} w-full`} /></label>
      <button type="button" disabled={busy} className={btn} onClick={() => run(
        center === "NARITA" ? `번호 「${ref.trim()}」를 저장할까요? 판매자 발송 주소 끝에 바로 붙고 판매자에게 알림이 갑니다.` : `CarryToJ 신청번호 「${ref.trim()}」를 저장할까요?`,
        async () => createBrowserSupabase().rpc("admin_set_center_step", { p_tx: txId, p_ref: ref.trim(), p_memo: memo }))}>{busy ? "저장 중…" : current?.ref ? "고쳐 저장" : "완료 표시"}</button>
      {msg && <p>{msg}</p>}
      {err && <p role="alert" className="text-tomo-rose">{err}</p>}
    </div>
  );
}

/** 한국 센터 실측 무게(실무게·부피무게 중 큰 값, kg). 신고 구간보다 비싸면 차액이 판매자 정산에서 빠진다 */
export function MeasuredWeightForm({ txId, declared, measured, overage }: { txId: string; declared: number | null; measured: number | null; overage: number }) {
  const [kg, setKg] = useState(measured != null ? String(measured) : "");
  const { busy, err, msg, run } = useRun();
  return (
    <div className="mt-2 grid max-w-md gap-1.5 text-[12px]">
      <span>신고 {declared ?? "—"}kg{measured != null && ` · 실측 ${measured}kg · 판매자 차감 ${overage.toLocaleString("ko-KR")}원`}</span>
      <span className="flex gap-1.5">
        <input type="number" step={0.01} min={0.01} value={kg} onChange={(e) => setKg(e.target.value)} placeholder="실측 kg" className={`${field} w-28`} />
        <button type="button" disabled={busy} className={btn} onClick={() => run(`실측 ${kg}kg 로 저장할까요? 신고 구간보다 비싸면 차액이 판매자 정산에서 빠지고 판매자에게 알림이 갑니다.`,
          async () => { const r = await createBrowserSupabase().rpc("admin_set_measured_weight", { p_tx: txId, p_kg: Number(kg) });
            return { error: r.error, ok: r.data ? `구간 금액 ${Number(r.data.fee).toLocaleString("ko-KR")}원 · 차감 ${Number(r.data.overage).toLocaleString("ko-KR")}원` : "" }; })}>실측 저장</button>
      </span>
      {msg && <p>{msg}</p>}
      {err && <p role="alert" className="text-tomo-rose">{err}</p>}
    </div>
  );
}

/** 통관 예치금 정산 — 실제 관부가세를 넣으면 남는 금액은 부분 환불(바로 실행, 실패하면 환불 대기열), 모자라면 운영 부담 기록 */
export function CustomsSettleForm({ txId, deposit, currency, settled }: { txId: string; deposit: number; currency: string; settled: { actual: number | null; shortfall: number } | null }) {
  const [amt, setAmt] = useState("");
  const [memo, setMemo] = useState("");
  const { busy, err, msg, run } = useRun();
  const unit = currency === "JPY" ? "엔" : "원";
  if (settled) return <p className="mt-2 text-[12px]">통관 정산 끝: 예치금 {deposit.toLocaleString("ko-KR")}{unit} · 실제 세금 {(settled.actual ?? 0).toLocaleString("ko-KR")}{unit}{settled.shortfall > 0 && ` · 운영 부담 ${settled.shortfall.toLocaleString("ko-KR")}${unit}`}</p>;
  return (
    <div className="mt-2 grid max-w-md gap-1.5 text-[12px]">
      <span>통관 예치금 {deposit.toLocaleString("ko-KR")}{unit} — 실제 관부가세(거래 통화)를 넣는다</span>
      <span className="flex gap-1.5">
        <input type="number" min={0} step={1} value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={`실제 세금(${unit})`} className={`${field} w-32`} />
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모(고지서 번호 등)" maxLength={200} className={`${field} flex-1`} />
      </span>
      <button type="button" disabled={busy || amt === ""} className={btn} onClick={() => {
        const a = Number(amt); const back = Math.max(0, deposit - a);
        return run(back > 0 ? `실제 세금 ${a.toLocaleString("ko-KR")}${unit} — 구매자에게 ${back.toLocaleString("ko-KR")}${unit} 을 환불할까요? 되돌릴 수 없습니다.`
          : `실제 세금 ${a.toLocaleString("ko-KR")}${unit} — 환불 없이 부족분 ${(a - deposit).toLocaleString("ko-KR")}${unit} 을 운영 부담으로 기록할까요?`,
        async () => {
          const r = await createBrowserSupabase().rpc("admin_settle_customs", { p_tx: txId, p_actual: a, p_memo: memo });
          if (r.error || !r.data?.refund) return { error: r.error, ok: r.error ? "" : "기록했어요(환불 없음)" };
          const res = await fetch("/api/admin/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.data.refund }) });
          const j = await res.json().catch(() => ({}));
          return { error: null, ok: j.status === "done" ? "부분 환불 완료" : `환불 대기열에 남음(${j.error ?? j.status ?? res.status}) — /admin/refunds 에서 다시 시도` };
        });
      }}>{busy ? "처리 중…" : "정산"}</button>
      {msg && <p>{msg}</p>}
      {err && <p role="alert" className="text-tomo-rose">{err}</p>}
    </div>
  );
}

/** 한국→일본 요율(원가·가산율) — 운영자만 본다. 고객 화면에는 최종 금액만 나간다 */
export function ShipRateEditor({ rates, markup }: { rates: { max_kg: number; cost_krw: number }[]; markup: number }) {
  const [mk, setMk] = useState(String(markup));
  const [edit, setEdit] = useState<Record<string, string>>({});
  const { busy, err, run } = useRun();
  const fee = (c: number, m: number) => Math.ceil((c * m) / 10 - 1e-9) * 10;
  return (
    <div className="grid gap-2 text-[12px]">
      <span className="flex items-center gap-1.5">가산율
        <input value={mk} onChange={(e) => setMk(e.target.value)} className={`${field} w-20`} />
        <button type="button" disabled={busy} className={btn} onClick={() => run(`가산율을 ${mk} 로 바꿀까요? 새로 여는 결제부터 적용됩니다.`,
          async () => createBrowserSupabase().rpc("admin_set_ship_markup", { p_markup: Number(mk) }))}>저장</button>
      </span>
      <table className="w-fit">
        <thead><tr><th className="pr-3 text-left">~kg</th><th className="pr-3 text-left">원가(원)</th><th className="pr-3 text-left">고객 금액</th><th /></tr></thead>
        <tbody>
          {rates.map((r) => {
            const k = String(r.max_kg);
            return (
              <tr key={k}>
                <td className="tnum pr-3">{Number(r.max_kg).toFixed(2)}</td>
                <td className="pr-3"><input value={edit[k] ?? String(r.cost_krw)} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={`${field} w-24`} /></td>
                <td className="tnum pr-3">{fee(r.cost_krw, markup).toLocaleString("ko-KR")}</td>
                <td>{edit[k] != null && edit[k] !== String(r.cost_krw) && (
                  <button type="button" disabled={busy} className={btn} onClick={() => run(`${k}kg 원가를 ${edit[k]}원으로 바꿀까요?`,
                    async () => createBrowserSupabase().rpc("admin_set_ship_rate", { p_max_kg: Number(k), p_cost_krw: Number(edit[k]) }))}>저장</button>
                )}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {err && <p role="alert" className="text-tomo-rose">{err}</p>}
    </div>
  );
}