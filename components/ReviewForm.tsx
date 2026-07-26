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
    <div className="rounded-card border bg-white p-4">
      <p className="mb-2 text-sm font-bold">후기 남기기 · レビュー</p>
      <div className="mb-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n}점`}
            className={`text-2xl ${n <= rating ? "text-tomo-coral" : "text-gray-300"}`}>♥</button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder="한줄 후기 (선택) · 一言レビュー" maxLength={200} rows={2}
        className="mb-2 w-full rounded-card border p-2 text-sm" />
      <button onClick={submit} disabled={busy}
        className="w-full rounded-full bg-tomo-coral py-2 font-bold text-white disabled:opacity-50">
        {busy ? "등록 중…" : "후기 등록"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
