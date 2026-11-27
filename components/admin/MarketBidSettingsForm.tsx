"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminMbError } from "@/lib/market-bid-admin";

// 입찰 대행 접수 스위치·한도(0052 admin_market_bid_settings). 접수를 켜도 고객 화면은 빌드 플래그 NEXT_PUBLIC_MARKET_AUCTION 이 있어야 보인다
type S = { accepting: boolean; cap_max_jpy: number; max_open: number; max_open_per_user: number; daily_cap_jpy: number; min_lead_minutes: number; max_lead_hours: number };
const FIELDS: [keyof S, string][] = [
  ["cap_max_jpy", "상한가 최대(엔)"], ["max_open", "전체 진행 건수"], ["max_open_per_user", "고객당 진행 건수"],
  ["daily_cap_jpy", "하루 신청 상한가 합(엔)"], ["min_lead_minutes", "마감 임박 거절(분)"], ["max_lead_hours", "마감까지 최대(시간)"],
];

export default function MarketBidSettingsForm({ initial }: { initial: S }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map(([k]) => [k, String(initial[k])])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  async function save(extra: Partial<S> = {}) {
    setBusy(true); setMsg("");
    const settings: Record<string, unknown> = { ...Object.fromEntries(FIELDS.map(([k]) => [k, Number(v[k])])), ...extra };
    const r = await fetch("/api/admin/market-bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    setBusy(false);
    setMsg(r?.ok ? "저장했어요" : adminMbError(String(j.error ?? "실패")));
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-2 p-3 text-[12px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold">접수</span>
        <span className={initial.accepting ? "text-tomo-coral-deep font-bold" : "a-muted"}>{initial.accepting ? "받는 중" : "멈춤"}</span>
        <button type="button" disabled={busy} className="press rounded-full bg-tomo-navy/5 px-3 py-1 font-bold"
          onClick={() => { if (window.confirm(initial.accepting ? "입찰 신청 접수를 멈출까요? 진행 중 건은 그대로예요" : "입찰 신청 접수를 켤까요? (고객 화면은 빌드 플래그가 있어야 보여요)")) void save({ accepting: !initial.accepting }); }}>
          {initial.accepting ? "접수 멈추기" : "접수 켜기"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="block font-semibold">{label}
            <input inputMode="numeric" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value.replace(/[^0-9]/g, "") }))}
              className="mt-0.5 w-full rounded-md border border-[var(--a-border)] bg-white px-2 py-1 font-normal" />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void save()} className="press rounded-full bg-tomo-navy px-3 py-1.5 font-bold text-white disabled:opacity-45">한도 저장</button>
        {msg && <span role="status">{msg}</span>}
      </div>
    </div>
  );
}
