import { t, type Lang } from "@/lib/i18n";

// 신뢰온도 게이지 — 숫자 + 액센트 바. 36.5 기준, 0~50 범위를 바 폭으로 표현 (하트 없음)
export default function HeartGauge({ temp, lang = "ko" }: { temp: number; lang?: Lang }) {
  const pct = Math.max(0, Math.min(100, (temp / 50) * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <span className="tnum text-[17px] font-extrabold text-ink">{temp.toFixed(1)}°</span>
        <span className="text-xs text-ink-soft">{t(lang, "detail.trust")}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-tomo-navy/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-tomo-coral-deep" style={{ width: `${pct}%` }} />
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-ink-faint">
        <span>0°</span>
        <span>{t(lang, "detail.trustBase")}</span>
        <span>50°</span>
      </div>
    </div>
  );
}
