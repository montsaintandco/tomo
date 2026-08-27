import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-brand text-5xl text-tomo-navy">404</p>
      <div>
        <p className="text-sm text-ink-soft">찾으시는 페이지가 없어요</p>
        <p className="mt-1 text-xs text-ink-faint">お探しのページが見つかりません</p>
      </div>
      <div className="mt-2 flex gap-2">
        <Link href="/" className="btn bg-tomo-navy px-5 py-2.5 text-sm text-white">홈으로</Link>
        <Link href="/global" className="btn bg-white px-5 py-2.5 text-sm text-tomo-navy shadow-[0_1px_2px_rgba(12,68,124,0.06)]">
          해외직구 보기
        </Link>
      </div>
    </main>
  );
}
