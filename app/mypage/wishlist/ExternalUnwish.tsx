"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import type { MarketSource } from "@/lib/market/types";

// 해외 상품 찜 해제 — /api/wish/external DELETE 후 목록을 다시 읽는다(UnwishButton 과 같은 모양)
export default function ExternalUnwish({ source, sourceId, lang }: { source: MarketSource; sourceId: string; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function remove() {
    setBusy(true);
    await fetch(`/api/wish/external?${new URLSearchParams({ source, id: sourceId })}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <button type="button" onClick={remove} disabled={busy || isPending} aria-label={t(lang, "wish.remove")} title={t(lang, "wish.remove")}
      className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-tomo-rose disabled:opacity-45">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
        <path d="m7 7 10 10M17 7 7 17" />
      </svg>
    </button>
  );
}
