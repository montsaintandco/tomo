"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

// compact: 하단 바용 44px 아이콘 버튼 (메루카리식 — 가격·구매 옆의 보조 액션)
export default function ChatButton({ listingId, lang = "ko", compact = false }: { listingId: string; lang?: Lang; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function start() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/chat/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "detail.chatFail"));
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="shrink-0">
        <button onClick={start} disabled={busy} aria-label={t(lang, "detail.chatAria")} title={t(lang, "detail.chat")}
          className="btn flex h-11 w-11 items-center justify-center border-[1.5px] border-tomo-navy bg-white text-tomo-navy">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M4 5.5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7.5L8 20v-4.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
          </svg>
        </button>
        {error && <p role="alert" className="absolute left-4 right-4 -top-6 text-xs text-tomo-rose">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex-1">
      <button onClick={start} disabled={busy}
        className="btn w-full border-[1.5px] border-tomo-navy bg-white py-3 text-center text-sm text-tomo-navy">
        {busy ? t(lang, "detail.connecting") : t(lang, "detail.chat")}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
