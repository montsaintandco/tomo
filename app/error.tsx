"use client";
import { useEffect } from "react";
import Link from "next/link";

// 서버 컴포넌트 예외(Supabase 장애·외부 마켓 타임아웃 등) — Next 기본 회색 화면 대신 브랜드 안내 + 다시 시도
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const ja = typeof document !== "undefined" && document.documentElement.lang === "ja";
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-brand text-4xl text-tomo-navy">TOMO</p>
      <div>
        <p className="text-sm text-ink">{ja ? "一時的な問題が発生しました" : "잠시 문제가 생겼어요"}</p>
        <p className="mt-1 text-xs text-ink-soft">{ja ? "もう一度お試しください。続く場合はお問い合わせください。" : "다시 시도해 주세요. 계속되면 문의 버튼으로 알려 주세요."}</p>
        {error.digest && <p className="mt-2 text-[11px] text-ink-faint">ref {error.digest}</p>}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={reset} className="btn bg-tomo-navy px-5 py-2.5 text-sm text-white">{ja ? "再試行" : "다시 시도"}</button>
        <Link href="/" className="btn border border-tomo-navy/15 bg-white px-5 py-2.5 text-sm text-ink">{ja ? "ホームへ" : "홈으로"}</Link>
      </div>
    </main>
  );
}
