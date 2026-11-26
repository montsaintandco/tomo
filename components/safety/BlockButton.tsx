"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

// 차단·해제 토글 → /api/block. 차단할 때만 확인을 받는다. 끝나면 화면을 새로 읽는다(채팅 입력창 잠금 등)
export default function BlockButton({ userId, initialBlocked, lang }: { userId: string; initialBlocked: boolean; lang: Lang }) {
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function toggle() {
    if (busy) return;
    if (!blocked && !window.confirm(t(lang, "trust.block.confirm"))) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/block", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, block: !blocked }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      setBlocked(!blocked);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t(lang, "trust.err.failed"));
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={blocked}
        className="press inline-flex min-h-11 items-center px-2 text-[12px] text-ink-soft underline-offset-2 hover:underline">
        {blocked ? t(lang, "trust.unblock") : t(lang, "trust.block")}
      </button>
      {error && <span role="alert" className="text-[11px] text-tomo-rose">{error}</span>}
    </span>
  );
}
