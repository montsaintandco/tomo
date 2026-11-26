import ResultsSkeleton from "@/components/search/ResultsSkeleton";

// 해외직구 검색은 외부 마켓 라이브 조회라 3~5초 — 피드 스켈레톤 대신 검색 페이지 모양 그대로.
// 결과 자리는 page.tsx 의 Suspense 대체 화면과 같은 ResultsSkeleton
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
      <div className="px-4 pt-2 md:px-0">
        <ResultsSkeleton />
      </div>
    </main>
  );
}