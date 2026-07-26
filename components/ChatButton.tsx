"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChatButton({ listingId }: { listingId: string }) {
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
      setError(err instanceof Error ? err.message : "채팅 시작 실패");
      setBusy(false);
    }
  }

  return (
    <div className="flex-1">
      <button onClick={start} disabled={busy}
        className="btn w-full border border-tomo-navy py-3 text-center text-tomo-navy">
        {busy ? "연결 중…" : "채팅하기"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
