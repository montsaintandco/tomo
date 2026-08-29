"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProxyRequestButton(props: {
  source: string; sourceId: string; title: string; price: number;
  currency: string; url: string; images: string[]; sellerName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function submit() {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(props),
      });
      const json = await res.json().catch(() => ({}));
      // 503 = 서비스 준비 중 — 오류가 아니라 대기 상태 (안전결제와 동일 관행)
      if (res.status === 503) { setMsg("대행 신청 준비 중이에요 · 代行準備中"); setBusy(false); return; }
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
        className="btn w-full bg-tomo-coral-deep py-3 text-white">
        {busy ? "신청 중…" : "대행 신청하기 · 代行を依頼"}
      </button>
      {msg && <p className="mt-1 text-center text-xs text-ink-soft">{msg}</p>}
      {error && <p className="mt-1 text-center text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
