"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type I18nKey, type Lang } from "@/lib/i18n";

export default function ProxyActions({ id, status, isOwner, isAdmin, lang = "ko" }: {
  id: string; status: string; isOwner: boolean; isAdmin: boolean; lang?: Lang;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState("");
  const router = useRouter();
  const working = busy || isPending;

  // 현재 상태·주체에서 가능한 액션 (DB advance_proxy 매트릭스와 정합)
  const actions: { label: string; to: string; tracking?: boolean; outline?: boolean }[] = [];
  if (isOwner && status === "quoted") actions.push({ label: t(lang, "pact.approve"), to: "approved" });
  if (isOwner && status === "delivered") actions.push({ label: t(lang, "pact.received"), to: "completed" });
  if (isOwner && ["requested", "quoted", "approved"].includes(status))
    actions.push({ label: t(lang, "pact.cancel"), to: "cancelled", outline: true });
  if (isAdmin) {
    const next: Record<string, [I18nKey, string, boolean?]> = {
      approved: ["pact.paid", "paid"],
      paid: ["pact.purchasing", "purchasing"],
      purchasing: ["pact.centerIn", "center_received"],
      center_received: ["pact.intlShip", "shipped_international", true],
      shipped_international: ["pact.delivered", "delivered"],
    };
    const n = next[status];
    if (n) actions.push({ label: `${t(lang, "pact.admin")} ${t(lang, n[0])}`, to: n[1], tracking: n[2] });
  }
  if (actions.length === 0) return null;

  async function run(to: string, withTracking?: boolean) {
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.rpc("advance_proxy", {
      p_id: id, p_to: to, p_tracking: withTracking ? (tracking.trim() || null) : null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    // refresh 완료까지 isPending으로 잠금 — 새 상태의 다음 액션이 바로 눌리게
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.some((a) => a.tracking) && (
        <>
          <label htmlFor={`proxy-tracking-${id}`} className="sr-only">{t(lang, "pact.tracking")}</label>
          <input id={`proxy-tracking-${id}`} value={tracking} onChange={(e) => setTracking(e.target.value)}
            placeholder={t(lang, "pact.tracking")} maxLength={100} autoComplete="off"
            className="rounded-full bg-white px-4 py-2.5 text-base shadow-soft placeholder:text-ink-soft" />
        </>
      )}
      {actions.map((a) => (
        <button key={a.to} onClick={() => run(a.to, a.tracking)} disabled={working}
          className={`btn w-full py-3 text-sm ${
            a.outline ? "border-[1.5px] border-tomo-navy/15 bg-white text-ink-soft" : "bg-tomo-coral-deep text-white"}`}>
          {working ? t(lang, "act.working") : a.label}
        </button>
      ))}
      {error && <p role="alert" className="text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
