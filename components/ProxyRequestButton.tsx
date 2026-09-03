"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

export default function ProxyRequestButton({ lang = "ko", ...props }: {
  source: string; sourceId: string; title: string; price: number;
  currency: string; url: string; images: string[]; sellerName: string; lang?: Lang;
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
      if (res.status === 503) { setMsg(t(lang, "ext.requestPending")); setBusy(false); return; }
      if (!res.ok) throw new Error(json.error || t(lang, "ext.requestFail"));
      router.push(`/proxy/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t(lang, "ext.requestFail"));
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={submit} disabled={busy}
        className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">
        {busy ? t(lang, "ext.requesting") : t(lang, "ext.request")}
      </button>
      {msg && <p className="mt-1 text-center text-xs text-ink-soft">{msg}</p>}
      {error && <p role="alert" className="mt-1 text-center text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
