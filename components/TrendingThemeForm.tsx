"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { LIVE_SOURCES, SOURCE_LABEL, type MarketSource } from "@/lib/market/types";

export type ThemeRow = {
  id?: string; country: "KR" | "JP"; key: string; label: string; label_ja: string;
  term: string; sources: string[]; sort_order: number; active: boolean;
};

// 큐레이션 테마 추가/수정 — RLS가 admin만 허용 (한국어 고정 운영 화면)
export default function TrendingThemeForm({ initial, onDone }: { initial: ThemeRow; onDone?: () => void }) {
  const [v, setV] = useState<ThemeRow>(initial);
  const [error, setError] = useState("");
  const [isPending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof ThemeRow, val: unknown) => setV({ ...v, [k]: val });
  const allowed = LIVE_SOURCES.filter((s) => (v.country === "KR" ? ["mercari", "yahoo_auction"] : ["daangn", "joongna"]).includes(s));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!v.key.match(/^[a-z0-9-]+$/)) { setError("키는 소문자·숫자·하이픈만"); return; }
    if (v.sources.length === 0) { setError("소스를 하나 이상 고르세요"); return; }
    const supabase = createBrowserSupabase();
    const row = { country: v.country, key: v.key, label: v.label, label_ja: v.label_ja, term: v.term,
      sources: v.sources, sort_order: v.sort_order, active: v.active, updated_at: new Date().toISOString() };
    const q = v.id ? supabase.from("trending_themes").update(row).eq("id", v.id) : supabase.from("trending_themes").insert(row);
    const { error: err } = await q;
    if (err) { setError(err.message); return; }
    onDone?.();
    start(() => router.refresh());
  }

  const input = "w-full rounded-full bg-tomo-ivory px-3 py-2 text-sm";
  return (
    <form onSubmit={save} className="card flex flex-col gap-2 p-3.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px] font-bold text-ink-soft">뷰어 나라
          <select value={v.country} onChange={(e) => set("country", e.target.value)} className={input}>
            <option value="KR">KR (일본 마켓 검색)</option><option value="JP">JP (한국 마켓 검색)</option>
          </select>
        </label>
        <label className="text-[12px] font-bold text-ink-soft">키 (url-safe)
          <input value={v.key} onChange={(e) => set("key", e.target.value)} className={input} placeholder="pokemon-card" required />
        </label>
        <label className="text-[12px] font-bold text-ink-soft">라벨 (ko)
          <input value={v.label} onChange={(e) => set("label", e.target.value)} className={input} required />
        </label>
        <label className="text-[12px] font-bold text-ink-soft">ラベル (ja)
          <input value={v.label_ja} onChange={(e) => set("label_ja", e.target.value)} className={input} required />
        </label>
        <label className="col-span-2 text-[12px] font-bold text-ink-soft">마켓 검색어 (마켓 언어로)
          <input value={v.term} onChange={(e) => set("term", e.target.value)} className={input} required />
        </label>
        <label className="text-[12px] font-bold text-ink-soft">순서
          <input type="number" value={v.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={input} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-[12px] font-bold text-ink-soft">
          <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> 노출
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-[12px]">
        {allowed.map((s) => (
          <label key={s} className="flex items-center gap-1 rounded-full bg-tomo-navy/5 px-2.5 py-1 font-bold text-tomo-navy">
            <input type="checkbox" checked={v.sources.includes(s)}
              onChange={(e) => set("sources", e.target.checked ? [...v.sources, s] : v.sources.filter((x) => x !== s))} />
            {SOURCE_LABEL[s as MarketSource]}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-[12px] text-tomo-rose">{error}</p>}
      <div className="flex justify-end gap-2">
        {onDone && <button type="button" onClick={onDone} className="press rounded-full px-3 py-1.5 text-[12px] font-bold text-ink-soft">취소</button>}
        <button disabled={isPending} className="btn bg-tomo-navy px-4 py-1.5 text-[12px] text-white">{v.id ? "저장" : "추가"}</button>
      </div>
    </form>
  );
}
