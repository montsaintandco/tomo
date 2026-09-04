"use client";
import { useState } from "react";
import AdminToggle from "@/components/AdminToggle";
import TrendingThemeForm, { type ThemeRow } from "@/components/TrendingThemeForm";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";

// 테마 한 줄 — 보기/수정 토글 + 노출/삭제 액션
export default function TrendingThemeCard({ theme }: { theme: ThemeRow & { id: string } }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <TrendingThemeForm initial={theme} onDone={() => setEditing(false)} />;
  return (
    <div className={`card flex items-center gap-3 p-3.5 ${theme.active ? "" : "opacity-60"}`}>
      <span className="tnum w-6 shrink-0 text-center text-[12px] font-bold text-ink-soft">{theme.sort_order}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{theme.label} <span className="font-normal text-ink-soft">· {theme.label_ja}</span></p>
        <p className="truncate text-[12px] text-ink-soft">
          “{theme.term}” · {theme.sources.map((s) => SOURCE_LABEL[s as MarketSource]).join("·")} · <code className="text-[11px]">{theme.key}</code>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" onClick={() => setEditing(true)} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-[12px] font-bold text-tomo-navy">수정</button>
        <AdminToggle label={theme.active ? "숨김" : "노출"} action={{ table: "trending_themes", id: theme.id, update: { active: !theme.active } }} />
        <AdminToggle label="삭제" danger confirmText={`'${theme.label}' 테마를 삭제할까요?`} action={{ table: "trending_themes", id: theme.id, del: true }} />
      </div>
    </div>
  );
}
