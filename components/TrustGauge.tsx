import { t, type Lang } from "@/lib/i18n";

// 신뢰온도 — 한 줄(이름 · 막대 · 숫자). 36.5 기준, 0~50 범위를 막대 폭으로. (옛 이름 HeartGauge)
export default function TrustGauge({ temp, lang = "ko" }: { temp: number; lang?: Lang }) {
  const pct = Math.max(0, Math.min(100, (temp / 50) * 100));
  return (
    <div className="flex items-center gap-3" title={t(lang, "detail.trustBase")}>
      <span className="shrink-0 text-xs font-bold text-ink-soft">{t(lang, "detail.trust")}</span>
      <div role="meter" aria-label={t(lang, "detail.trust")} aria-valuemin={0} aria-valuemax={50} aria-valuenow={temp}
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-tomo-navy/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-tomo-coral-deep" style={{ width: `${pct}%` }} />
      </div>
      <span className="tnum shrink-0 text-[15px] font-extrabold text-ink">{temp.toFixed(1)}°</span>
    </div>
  );
}
