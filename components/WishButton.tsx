"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

const HEART = "M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z";

// 찜 토글 — RLS가 본인 행만 허용하므로 API 라우트 없이 브라우저 클라이언트로 직접 쓴다
export default function WishButton({ listingId, price, initialLiked, initialCount, guest, lang }: {
  listingId: string; price: number; initialLiked: boolean; initialCount: number; guest: boolean; lang: Lang;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (guest) { router.push(`/login?next=/listings/${listingId}`); return; }
    if (busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next); setCount((c) => Math.max(0, c + (next ? 1 : -1)));   // 낙관적 반영
    try {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push(`/login?next=/listings/${listingId}`); return; }
      const { error } = next
        ? await supabase.from("wishlists").insert({ user_id: user.id, listing_id: listingId, price_at_wish: price })
        : await supabase.from("wishlists").delete().eq("user_id", user.id).eq("listing_id", listingId);
      if (error && error.code !== "23505") throw error;   // 이미 찜한 경우는 성공으로 본다
    } catch {
      setLiked(!next); setCount((c) => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={liked}
      aria-label={liked ? t(lang, "detail.unwishAria") : t(lang, "detail.wishAria")}
      className={`press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold ${
        liked ? "bg-tomo-coral-deep/10 text-tomo-coral-deep" : "bg-tomo-navy/5 text-tomo-navy"}`}>
      <svg key={String(liked)} viewBox="0 0 24 24" className={`h-4 w-4 ${liked ? "pop" : ""}`} aria-hidden
        fill={liked ? "#C14E4C" : "none"} stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round">
        <path d={HEART} />
      </svg>
      <span className="tnum">{count > 0 ? count : t(lang, "detail.wish")}</span>
    </button>
  );
}
