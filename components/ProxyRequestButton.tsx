"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

// SAZO식 요청란: 옵션·사이즈 지정 + 묶음배송 희망. 둘 다 note 한 필드로 어드민 큐에 전달 (스키마 변경 없음)
export default function ProxyRequestButton({ lang = "ko", ...props }: {
  source: string; sourceId: string; title: string; price: number;
  currency: string; url: string; images: string[]; sellerName: string; lang?: Lang;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [bundle, setBundle] = useState(false);
  const router = useRouter();

  async function submit() {
    setBusy(true); setError(""); setMsg("");
    try {
      const fullNote = `${bundle ? t(lang, "ext.bundleTag") + " " : ""}${note.trim()}`.trim();
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...props, note: fullNote }),
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
    <div className="flex flex-col gap-2">
      <label className="text-[12px] font-bold text-ink">
        {t(lang, "ext.noteLabel")}
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
          placeholder={t(lang, "ext.notePlaceholder")}
          className="mt-1 w-full rounded-full bg-tomo-ivory px-4 py-2.5 text-base font-normal placeholder:text-ink-soft" />
      </label>
      <label className="flex items-center gap-2 text-[12px] font-bold text-ink">
        <input type="checkbox" className="h-4 w-4 accent-[#C14E4C]" checked={bundle} onChange={(e) => setBundle(e.target.checked)} />
        {t(lang, "ext.bundle")}
      </label>
      <button onClick={submit} disabled={busy}
        className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">
        {busy ? t(lang, "ext.requesting") : t(lang, "ext.request")}
      </button>
      {msg && <p className="text-center text-xs text-ink-soft">{msg}</p>}
      {error && <p role="alert" className="text-center text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
