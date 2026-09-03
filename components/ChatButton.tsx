"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

export default function ChatButton({ listingId, lang = "ko" }: { listingId: string; lang?: Lang }) {
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
