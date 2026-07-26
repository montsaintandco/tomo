// 신뢰온도 하트 게이지 (스펙 §2). 36.5 기준, 0~50 범위를 바 폭으로 표현.
export default function HeartGauge({ temp }: { temp: number }) {
  const pct = Math.max(0, Math.min(100, (temp / 50) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-lg font-bold text-tomo-coral">♥ {temp.toFixed(1)}°</span>
        <span className="text-xs text-gray-400">신뢰온도 · 信頼温度</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-tomo-coral" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
