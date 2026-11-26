// 해외직구 검색은 외부 마켓 라이브 조회라 3~5초 — 피드 스켈레톤 대신 검색 페이지 모양 그대로
export default function GlobalLoading() {
  return (
    <main className="mx-auto max-w-md md:max-w-6xl md:px-6" aria-busy aria-label="loading">
      <div className="px-4 pb-3 pt-3 md:px-0 md:pb-4 md:pt-8">
        <div className="skeleton h-6 w-24 rounded md:h-7" />
        <div className="skeleton mt-2 h-4 w-72 rounded" />
        <div className="skeleton mt-4 h-11 w-full rounded-full md:h-14 md:max-w-xl" />
        {/* 클래스 이름을 통째로 써야 tailwind 가 만든다(w-${n} 조립은 안 생김) */}
        <div className="mt-4 flex gap-2">{["w-16", "w-24", "w-28"].map((w) => <div key={w} className={`skeleton h-10 ${w} rounded-full`} />)}</div>
      </div>
      {/* 건수·정렬 줄 자리 */}
      <div className="mb-3 flex items-center gap-2 px-4 md:px-0">
        <div className="skeleton h-5 w-16 rounded" />
        {["w-14", "w-14", "w-20", "w-20"].map((w, i) => <div key={i} className={`skeleton h-8 ${w} rounded-full`} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 md:grid-cols-5 md:gap-x-5 md:px-0">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}>
            <div className="skeleton aspect-square rounded-thumb" />
            <div className="skeleton mt-2 h-4 w-5/6 rounded" />
            <div className="skeleton mt-1.5 h-4 w-1/3 rounded" />
          </li>
        ))}
      </ul>
    </main>
  );
}
