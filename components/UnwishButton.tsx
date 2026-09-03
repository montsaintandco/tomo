"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

export default function UnwishButton({ listingId, lang }: { listingId: string; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function remove() {
    setBusy(true);
    const supabase = createBrowserSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("wishlists").delete().eq("user_id", user.id).eq("listing_id", listingId);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <button type="button" onClick={remove} disabled={busy || isPending} aria-label={t(lang, "wish.remove")} title={t(lang, "wish.remove")}
      className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-tomo-rose disabled:opacity-45">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
        <path d="m7 7 10 10M17 7 7 17" />
      </svg>
    </button>
  );
}
