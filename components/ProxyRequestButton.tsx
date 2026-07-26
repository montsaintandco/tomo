"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProxyRequestButton(props: {
  source: string; sourceId: string; title: string; price: number;
  currency: string; url: string; images: string[]; sellerName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(props),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "신청 실패");
      router.push(`/proxy/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "신청 실패");
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={submit} disabled={busy}
        className="w-full rounded-full bg-tomo-coral py-3 font-bold text-white disabled:opacity-50">
        {busy ? "신청 중…" : "대행 신청하기 · 代行を依頼"}
      </button>
      {error && <p className="mt-1 text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}
