"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import type { ExternalWish } from "@/components/search/wish";

const HEART = "M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z";

// 해외 상품 찜 토글 — /api/wish/external(0038). 비로그인은 로그인으로(지금 주소로 돌아오게).
// 낙관적 반영 후 실패하면 되돌린다. compact: 카드 사진 위 하트(보이는 원 32px, 누르는 자리 44px — WishButton 과 같은 모양)
export default function ExternalWishButton({ item, initialWished, guest, lang, compact = false, className = "" }: {
  item: ExternalWish; initialWished: boolean; guest: boolean; lang: Lang; compact?: boolean; className?: string;
}) {
  const [liked, setLiked] = useState(initialWished);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toLogin = () => router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);

  async function toggle() {
    if (guest) { toLogin(); return; }
    if (busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    try {
      const res = next
        ? await fetch("/api/wish/external", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) })
        : await fetch(`/api/wish/external?${new URLSearchParams({ source: item.source, id: item.sourceId })}`, { method: "DELETE" });
      if (res.status === 401) { setLiked(!next); toLogin(); return; }
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setLiked(!next);
    } finally {
      setBusy(false);
    }
  }

  const label = liked ? t(lang, "detail.unwishAria") : t(lang, "detail.wishAria");
  const icon = (cls: string) => (
    <svg key={String(liked)} viewBox="0 0 24 24" className={`${cls} ${liked ? "pop" : ""}`} aria-hidden
      fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round">
      <path d={HEART} />
    </svg>
  );

  if (compact) return (
    <button type="button" onClick={toggle} aria-pressed={liked} aria-label={label} aria-busy={busy}
      className={`press flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-soft before:absolute before:-inset-1.5 before:content-[''] ${liked ? "text-accent" : "text-ink"} ${className || "relative"}`}>
      {icon("h-[18px] w-[18px]")}
    </button>
  );

  return (
    <button type="button" onClick={toggle} aria-pressed={liked} aria-label={label} aria-busy={busy}
      className={`press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${
        liked ? "bg-accent-tint text-accent-ink" : "bg-tomo-navy/5 text-tomo-navy"} ${className}`}>
      {icon("h-4 w-4")}
      <span>{t(lang, "detail.wish")}</span>
    </button>
  );
}
