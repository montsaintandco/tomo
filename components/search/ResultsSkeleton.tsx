// 검색 결과 자리 스켈레톤 — 건수·정렬 줄 + 빠른 칩 줄 + 카드 격자. /global 첫 진입(loading.tsx)과
// 검색어·탭·필터·칩을 바꿀 때(page.tsx 의 Suspense key) 같은 모양을 쓴다
export default function ResultsSkeleton() {
  return (
    <div aria-busy aria-label="loading">
      <div className="mb-2 flex items-center gap-2">
        <div className="skeleton h-5 w-16 rounded" />
        {["w-14", "w-14", "w-20", "w-20"].map((w, i) => <div key={i} className={`skeleton h-8 ${w} rounded-full`} />)}
      </div>
      <div className="mb-3 flex gap-1.5">
        {["w-20", "w-24", "w-20", "w-14", "w-12"].map((w, i) => <div key={i} className={`skeleton h-9 ${w} rounded-full`} />)}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 md:gap-x-5 md:gap-y-7 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}>
            <div className="skeleton aspect-square rounded-thumb" />
            <div className="skeleton mt-2 h-4 w-5/6 rounded" />
            <div className="skeleton mt-1.5 h-4 w-1/3 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
