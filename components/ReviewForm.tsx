"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function ReviewForm({ txId }: { txId: string }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit() {
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("submit_review", {
      p_tx_id: txId, p_rating: rating, p_comment: comment.trim(),
    });
    if (error) { setError(error.message); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="card p-4">
      <p className="mb-2 text-sm font-bold">후기 남기기 · レビュー</p>
      <div className="mb-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n}점`} aria-pressed={n <= rating}
            className={`press text-2xl ${n <= rating ? "text-tomo-coral" : "text-ink-faint"}`}>♥</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder="한줄 후기 (선택) · 一言レビュー" maxLength={200} rows={2}
        className="mb-2 w-full rounded-card bg-tomo-ivory p-3 text-sm placeholder:text-ink-soft" />
      <button onClick={submit} disabled={busy}
        className="btn w-full bg-tomo-coral-deep py-2 text-white">
        {busy ? "등록 중…" : "후기 등록"}
      </button>
      {error && <p className="mt-1 text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
