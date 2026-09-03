// 브랜드 프리미티브 (스펙 §2): 하트 O 워드마크, 두 말풍선 심볼, 국가 말풍선 칩

/* TOMO — 마지막 O를 하트로 치환한 워드마크 */
export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  return (
    <span className={`font-brand inline-flex items-baseline text-tomo-navy ${className}`} role="img" aria-label="TOMO">
      <span aria-hidden>TOM</span>
      <svg viewBox="0 0 24 24" className="heartbeat ml-[2px] h-[0.8em] w-[0.8em] self-center" aria-hidden>
        <path
          d="M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z"
          fill="#E2807F"
        />
      </svg>
    </span>
  );
}

/* 두 말풍선이 겹치는 곳에 하트 — 빈 상태·안내에 쓰는 심볼 */
export function TomoSymbol({ className = "h-16 w-24" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 64" className={className} aria-hidden>
      {/* 블루 말풍선 (한국) */}
      <path
        d="M8 22c0-8 6.5-14 14.5-14H40c8 0 14.5 6 14.5 14v6c0 8-6.5 14-14.5 14H30l-8 9v-9h-.5C13.5 42 8 36 8 28z"
        fill="#9CC5EC" opacity="0.9"
      />
      {/* 핑크 말풍선 (일본) */}
      <path
        d="M42 28c0-8 6.5-14 14.5-14H74c8 0 14 6 14 14v6c0 8-6 14-14 14h-.5v9l-8-9H56.5C48.5 48 42 42 42 34z"
        fill="#F2AFAF" opacity="0.9"
      />
      {/* 겹침에서 태어나는 하트 */}
      <path
        d="M48.5 40.5c-3.6-2.9-7.1-5.6-7.1-9.1 0-2.5 1.9-4.1 4-4.1 1.3 0 2.5.7 3.1 1.7.6-1 1.8-1.7 3.1-1.7 2.1 0 4 1.6 4 4.1 0 3.5-3.5 6.2-7.1 9.1z"
        fill="#E2807F"
      />
    </svg>
  );
}

/* 국가 말풍선 칩 — 국기 대신 파스텔 말풍선. KR=블루(꼬리 왼쪽), JP=핑크(꼬리 오른쪽) */
export function CountryChip({ country, className = "" }: { country: "KR" | "JP"; className?: string }) {
  return (
    <span
      className={`${country === "KR" ? "bubble-kr" : "bubble-jp"} inline-block px-1.5 py-0.5 text-[11px] font-bold leading-none ${className}`}
    >
      {country}
    </span>
  );
}
