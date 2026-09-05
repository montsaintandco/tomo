"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

const HEART = "M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z";

export default function ReviewForm({ txId, lang = "ko" }: { txId: string; lang?: Lang }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const working = busy || isPending;

  async function submit() {
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("submit_review", {
      p_tx_id: txId, p_rating: rating, p_comment: comment.trim(),
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    startTransition(() => router.refresh());
  }

  return (
    <div className="card p-4">
      <p className="mb-2 text-sm font-bold text-ink">{t(lang, "review.title")}</p>
      {/* 하트 별점 — 코랄(장식 하트)로 채우고, 빈 하트는 틴트 스트로크 */}
      <div className="mb-3 flex gap-1" role="radiogroup" aria-label={t(lang, "review.title")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} role="radio" aria-checked={n === rating}
            aria-label={t(lang, "review.star", { n })} className="press flex h-11 w-11 items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
              <path d={HEART} fill={n <= rating ? "#1D4ED8" : "none"} stroke={n <= rating ? "#1D4ED8" : "#93A0AB"} strokeWidth={1.8} />
            </svg>
          </button>
        ))}
      </div>
      <label htmlFor="review-comment" className="sr-only">{t(lang, "review.placeholder")}</label>
      <textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder={t(lang, "review.placeholder")} maxLength={200} rows={2}
        className="mb-2 w-full rounded-card bg-tomo-ivory p-3 text-base placeholder:text-ink-soft" />
      <button onClick={submit} disabled={working}
        className="btn w-full bg-tomo-coral-deep py-2.5 text-sm text-white">
        {working ? t(lang, "review.submitting") : t(lang, "review.submit")}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
