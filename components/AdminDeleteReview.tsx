"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

// 운영자만 보이는 후기 삭제 (RLS: admin deletes reviews)
export default function AdminDeleteReview({ reviewId, lang }: { reviewId: string; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  async function remove() {
    if (!confirm(t(lang, "review.delete") + "?")) return;
    setBusy(true);
    await createBrowserSupabase().from("reviews").delete().eq("id", reviewId);
    setBusy(false);
    startTransition(() => router.refresh());
  }
  return (
    <button type="button" onClick={remove} disabled={busy || isPending}
      className="press text-[11px] text-tomo-rose underline underline-offset-2 disabled:opacity-45">
      {t(lang, "review.delete")}
    </button>
  );
}
