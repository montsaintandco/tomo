import { t, type Lang } from "@/lib/i18n";

// 신뢰온도 하트 게이지 (스펙 §2). 36.5 기준, 0~50 범위를 바 폭으로 표현.
export default function HeartGauge({ temp, lang = "ko" }: { temp: number; lang?: Lang }) {
  const pct = Math.max(0, Math.min(100, (temp / 50) * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between">
        <span className="tnum flex items-center gap-1.5 text-[17px] font-extrabold text-tomo-coral-deep">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path d="M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z" fill="#C14E4C" />
          </svg>
          {temp.toFixed(1)}°
        </span>
        <span className="text-xs text-ink-soft">{t(lang, "detail.trust")}</span>
      </div>
      {/* 핑크→코랄로 데워지는 트랙 (브릿지 그라데이션은 여행 직거래 뱃지 전용이라 안 씀) */}
      <div className="relative h-2.5 overflow-hidden rounded-full bg-tomo-navy/5">
        <div className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: "linear-gradient(90deg, #F2AFAF, #C14E4C)" }} />
      </div>
      <div className="tnum mt-1 flex justify-between text-[11px] text-ink-faint">
        <span>0°</span>
        <span>{t(lang, "detail.trustBase")}</span>
        <span>50°</span>
      </div>
    </div>
  );
}
