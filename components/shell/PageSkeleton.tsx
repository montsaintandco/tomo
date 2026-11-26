// 글 위주 공개 페이지(소개·가이드·공지·약관·고객센터·카테고리)의 loading.tsx 용 — 누르는 즉시 화면이 바뀐다(01 「loading.tsx 없는 공개 페이지」)
export default function PageSkeleton() {
  return (
    <main className="mx-auto max-w-md px-4 pt-6 md:max-w-3xl md:px-6 md:pt-10" aria-busy aria-label="loading">
      <div className="skeleton h-7 w-48 rounded md:h-9 md:w-72" />
      <div className="skeleton mt-3 h-4 w-64 rounded" />
      <div className="mt-8 flex flex-col gap-3">
        {[100, 92, 96, 70, 100, 88, 60].map((w, i) => (
          <div key={i} className="skeleton h-4 rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="skeleton mt-8 h-24 w-full rounded-card" />
    </main>
  );
}