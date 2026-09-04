"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

export default function OrderActions({ id, lang }: { id: string; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function payAgain() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) { setMsg(t(lang, "order.pending")); setBusy(false); return; }
    if (!res.ok) { setMsg(json.error || t(lang, "order.fail")); setBusy(false); return; }
    window.location.href = json.url;
  }
  async function cancel() {
    if (!confirm(t(lang, "order.cancelConfirm"))) return;
    setBusy(true);
    const res = await fetch("/api/order", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(json.error || t(lang, "order.fail")); return; }
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={payAgain} disabled={busy} className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">{t(lang, "order.payAgain")}</button>
      <button type="button" onClick={cancel} disabled={busy} className="btn w-full border-[1.5px] border-tomo-navy/15 bg-white py-3 text-sm text-ink-soft">{t(lang, "order.cancel")}</button>
      {msg && <p className="text-center text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
