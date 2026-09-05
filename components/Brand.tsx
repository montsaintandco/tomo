// 브랜드 프리미티브 v3 (정제된 마켓): 텍스트 워드마크, 중립 빈 상태 글리프, KR/JP 텍스트 칩. 장식 하트·말풍선 없음

/* TOMO — 텍스트 워드마크. 무게와 자간으로만 말한다 */
export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  return (
    <span className={`font-brand inline-block leading-none text-ink ${className}`} aria-label="TOMO">TOMO</span>
  );
}

/* 빈 상태·이미지 없음 글리프 — 사진 자리를 뜻하는 중립 아이콘 (1.6 스트로크, 브랜드 색 없음) */
export function TomoSymbol({ className = "h-16 w-24" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 64" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" style={{ color: "#9CA3AF" }}>
      <rect x="20" y="10" width="56" height="44" rx="6" />
      <circle cx="38" cy="26" r="5" />
      <path d="M20 46l16-14 12 10 10-8 18 14" />
    </svg>
  );
}

/* 국가 표시 — 색 대신 글자. 회색 필 위 진한 텍스트 */
export function CountryChip({ country, className = "" }: { country: "KR" | "JP"; className?: string }) {
  return (
    <span className={`${country === "KR" ? "bubble-kr" : "bubble-jp"} inline-block px-1.5 py-0.5 text-[11px] font-bold leading-none ${className}`}>
      {country}
    </span>
  );
}
