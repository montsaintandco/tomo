"use client";
// 신청 상세(/bids/[id]) 보조: 30초마다 새로 읽기(가린 탭은 멈춤) + 입찰 전 취소 버튼(DELETE /api/market-bid)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

export function BidRefresh({ ms = 30_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const h = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => clearInterval(h);
  }, [router, ms]);
  return null;
}

// 매입 실패 뒤 재결제(PUT /api/market-bid → 즉시 결제 창). 금액·기한은 서버가 다시 본다
export function BidRepay({ lang, bidId, label }: { lang: Lang; bidId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true); setError("");
    const r = await fetch("/api/market-bid", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bidId }) }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    if (r?.ok && j.url) { window.location.assign(j.url); return; }
    setBusy(false);
    setError(j.error ?? t(lang, "mb.err.failed"));
  }
  return (
    <div>
      <button type="button" disabled={busy} onClick={run} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white disabled:opacity-50">{busy ? t(lang, "mb.d.repayBusy") : label}</button>
      {error && <p role="alert" className="mt-1 text-[12px] text-tomo-rose">{error}</p>}
    </div>
  );
}

export function BidCancel({ lang, bidId }: { lang: Lang; bidId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (!window.confirm(t(lang, "mb.d.cancelConfirm"))) return;
    setBusy(true); setError("");
    const r = await fetch("/api/market-bid", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bidId }) }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!r?.ok) { setError(j.error ?? t(lang, "mb.err.failed")); return; }
    router.refresh();
  }
  return (
    <div>
      <button type="button" disabled={busy} onClick={run} className="btn w-full border border-tomo-navy/15 bg-white py-2.5 text-[13px] text-ink disabled:opacity-50">{t(lang, "mb.d.cancel")}</button>
      {error && <p role="alert" className="mt-1 text-[12px] text-tomo-rose">{error}</p>}
    </div>
  );
}
