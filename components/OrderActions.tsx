"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import type { RecheckChange } from "@/lib/price-check";
import PriceChangedDialog from "@/components/pay/PriceChangedDialog";

export default function OrderActions({ id, lang }: { id: string; lang: Lang }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [changes, setChanges] = useState<RecheckChange[] | null>(null);
  const router = useRouter();

  async function payAgain() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: id }) });
    const json = await res.json().catch(() => ({}));
    // 15분 넘은 대기 주문: 가격·품절이 바뀌었으면 이 주문은 결제하지 않는다(취소 → 장바구니에서 다시 주문)
    if (res.status === 409 && json.code === "pay.err.changed" && Array.isArray(json.changes)) { setChanges(json.changes); setBusy(false); return; }
    if (res.status === 503) { setMsg(json.error || t(lang, "order.pending")); setBusy(false); return; }
    if (!res.ok) { setMsg(json.error || t(lang, "order.fail")); setBusy(false); return; }
    if (json.url) window.location.href = json.url; else setBusy(false);
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
      {changes && <PriceChangedDialog lang={lang} changes={changes} hint={t(lang, "pay.recheck.reorder")} onClose={() => setChanges(null)} />}
    </div>
  );
}
