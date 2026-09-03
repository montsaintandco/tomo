"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Lang } from "@/lib/i18n";

// 브랜드 장치를 기능으로: 파란 말풍선 KR ⇄ 분홍 말풍선 JP. 쿠키 저장 후 서버 렌더를 새로 받는다
function writeLangCookie(next: Lang) {
  document.cookie = `tomo_lang=${next}; path=/; max-age=31536000; samesite=lax`;
}

export default function LangToggle({ lang, label }: { lang: Lang; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (next: Lang) => {
    if (next === lang) return;
    writeLangCookie(next);
    start(() => router.refresh());
  };
  const chip = (code: "KR" | "JP", value: Lang) => {
    const active = lang === value;
    return (
      <button type="button" onClick={() => set(value)} aria-pressed={active} disabled={pending}
        className={`press ${code === "KR" ? "bubble-kr" : "bubble-jp"} px-2 py-1 text-[11px] font-bold leading-none transition-opacity ${active ? "opacity-100" : "opacity-40 hover:opacity-70"}`}>
        {code}
      </button>
    );
  };
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {chip("KR", "ko")}
      {chip("JP", "ja")}
    </div>
  );
}
