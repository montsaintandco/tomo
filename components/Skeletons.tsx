// 라우트 loading.tsx용 스켈레톤 — 클릭 즉시 페이지가 바뀌고, 데이터는 그 자리에서 스트리밍된다 (이동 후 로딩)

export function FeedSkeleton() {
  return (
    <main className="mx-auto max-w-md px-4 pt-4 md:max-w-6xl md:px-6 md:pt-8" aria-busy aria-label="loading">
      <div className="skeleton h-7 w-40 rounded md:h-9 md:w-64" />
      <div className="skeleton mt-3 h-4 w-64 rounded" />
      <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 md:gap-x-5 md:gap-y-7">
        {Array.from({ length: 8 }, (_, i) => (
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

export function DetailSkeleton() {
  return (
    <main className="mx-auto max-w-md pb-24 md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-8" aria-busy aria-label="loading">
      <div className="skeleton aspect-square w-full md:rounded-card" />
      <div className="flex flex-col gap-4 p-4 md:p-0">
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-6 w-4/5 rounded" />
        <div className="skeleton h-7 w-28 rounded" />
        <div className="skeleton h-24 w-full rounded-card" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-11/12 rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
      </div>
    </main>
  );
}

export function TableSkeleton() {
  return (
    <div aria-busy aria-label="loading">
      <div className="skeleton h-6 w-40 rounded" />
      <div className="skeleton mt-4 h-9 w-full rounded" />
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton mt-1.5 h-11 w-full rounded" />)}
    </div>
  );
}

// 리스트형 페이지(채팅 목록·마이페이지·장바구니·거래·주문·프로필) — 제목 + 행 목록
export function ListSkeleton() {
  return (
    <main className="mx-auto max-w-md p-4 pb-8 md:max-w-2xl md:px-6 md:pb-16 md:pt-8" aria-busy aria-label="loading">
      <div className="skeleton h-7 w-32 rounded" />
      <div className="mt-5 flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-14 w-14 shrink-0 rounded-thumb" />
            <div className="flex-1">
              <div className="skeleton h-4 w-3/4 rounded" />
              <div className="skeleton mt-2 h-3.5 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// 채팅방 — 상대 헤더 + 말풍선 + 입력창
export function ChatSkeleton() {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col md:h-[calc(100dvh-65px)] md:max-w-2xl" aria-busy aria-label="loading">
      <div className="flex items-center gap-3 border-b border-tomo-navy/10 p-3"><div className="skeleton h-9 w-9 rounded-full" /><div className="skeleton h-4 w-32 rounded" /></div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {[60, 40, 72, 48, 56].map((w, i) => (
          <div key={i} className={`skeleton h-10 rounded-[14px] ${i % 2 ? "self-end" : ""}`} style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="p-3"><div className="skeleton h-11 w-full rounded-full" /></div>
    </main>
  );
}

// 폼 페이지(판매·수정·프로필 편집) — 라벨 + 필드
export function FormSkeleton() {
  return (
    <main className="mx-auto max-w-md p-4 pb-8 md:max-w-2xl md:px-6 md:pb-16 md:pt-8" aria-busy aria-label="loading">
      <div className="skeleton h-7 w-32 rounded" />
      <div className="skeleton mt-5 h-28 w-full rounded-card" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="mt-4"><div className="skeleton h-3.5 w-20 rounded" /><div className="skeleton mt-2 h-11 w-full rounded-card" /></div>
      ))}
    </main>
  );
}
