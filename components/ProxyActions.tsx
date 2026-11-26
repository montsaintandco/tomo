"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { formatPrice, type Currency } from "@/lib/currency";

export type ProxyRefundPreview = { amount: number; cap: number; currency: Currency };

export default function ProxyActions({ id, status, isOwner, isAdmin, lang = "ko", cancelRequestedAt = null, cancelReason = null, refundPreview = null }: {
  id: string; status: string; isOwner: boolean; isAdmin: boolean; lang?: Lang;
  cancelRequestedAt?: string | null; cancelReason?: string | null; refundPreview?: ProxyRefundPreview | null;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tracking, setTracking] = useState("");
  const [reqOpen, setReqOpen] = useState(false);
  const [reqReason, setReqReason] = useState("");
  const [adminReason, setAdminReason] = useState(cancelReason ?? "");
  const [refundAmount, setRefundAmount] = useState(refundPreview ? String(refundPreview.amount) : "");
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
  const canRequestCancel = isOwner && status === "paid";          // 결제 후 현지 구매 전: 고객은 요청만, 운영자가 승인·환불
  const canAdminCancel = isAdmin && !["completed", "cancelled"].includes(status);
  if (actions.length === 0 && !canRequestCancel && !canAdminCancel && !notice && !error) return null;

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

  async function requestCancel() {
    setBusy(true); setError("");
    const { error } = await createBrowserSupabase().rpc("request_proxy_cancel", { p_id: id, p_reason: reqReason.trim() });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setReqOpen(false);
    startTransition(() => router.refresh());
  }

  // 운영자 취소 — 서버 라우트가 DB 취소(환불 행) 후 Stripe 환불, 실패하면 /admin/refunds 대기열
  async function adminCancel() {
    if (!confirm(t(lang, "refund.confirm"))) return;
    setBusy(true); setError(""); setNotice("");
    const res = await fetch("/api/admin/cancel", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "proxy", id, reason: adminReason.trim(), refundAmount: refundPreview ? refundAmount : null }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(String(j.error ?? res.status)); return; }
    setNotice(!j.refund ? t(lang, "refund.msgOk")
      : j.refund.status === "done" ? t(lang, "refund.msgDone") : t(lang, "refund.msgQueued", { error: String(j.refund.error ?? "") }));
    startTransition(() => router.refresh());
  }

  const amountNum = Number(refundAmount);
  const amountBad = !!refundPreview && (refundAmount.trim() === "" || !Number.isInteger(amountNum) || amountNum < 0 || amountNum > refundPreview.cap);

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

      {/* 고객: 결제 후 취소 요청 */}
      {canRequestCancel && (cancelRequestedAt ? (
        <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-[13px] text-ink-soft">{t(lang, "refund.cancelRequested")}</p>
      ) : (
        <div>
          <button type="button" onClick={() => setReqOpen(!reqOpen)} aria-expanded={reqOpen}
            className="press w-full py-2 text-center text-[12px] text-ink-soft underline underline-offset-2 hover:text-tomo-rose">
            {t(lang, "refund.cancelRequest")}
          </button>
          {reqOpen && (
            <div className="reveal mt-1 flex flex-col gap-2 rounded-card bg-tomo-navy/5 p-3">
              <p className="text-[12px] text-ink-soft">{t(lang, "refund.cancelRequestNote")}</p>
              <textarea value={reqReason} onChange={(e) => setReqReason(e.target.value)} rows={3} maxLength={1000}
                placeholder={t(lang, "refund.cancelReasonPh")}
                className="w-full rounded-card bg-white px-3 py-2.5 text-base placeholder:text-ink-soft" />
              <button type="button" disabled={working || !reqReason.trim()} onClick={requestCancel}
                className="btn bg-tomo-rose py-2.5 text-sm text-white">
                {working ? t(lang, "act.working") : t(lang, "refund.cancelRequestSubmit")}
              </button>
            </div>
          )}
        </div>
      ))}

      {/* 운영자: 대행 취소 + 환불액 미리보기(상한 안에서 수정) */}
      {canAdminCancel && (
        <details className="rounded-card bg-tomo-navy/5 p-3" open={!!cancelRequestedAt}>
          <summary className="cursor-pointer text-[13px] font-bold text-tomo-rose">
            {t(lang, "refund.adminCancelProxy")}{cancelRequestedAt && ` · ${t(lang, "refund.customerRequested")}`}
          </summary>
          <div className="reveal mt-2 flex flex-col gap-2">
            <input value={adminReason} onChange={(e) => setAdminReason(e.target.value)} maxLength={1000}
              placeholder={t(lang, "refund.reasonPh")}
              className="rounded-full bg-white px-4 py-2 text-sm placeholder:text-ink-soft" />
            {refundPreview ? (
              <label className="block">
                <span className="mb-0.5 block text-[11px] text-ink-soft">{t(lang, "refund.amountInput", { cur: refundPreview.currency })}</span>
                <input type="number" min={0} max={refundPreview.cap} step={1} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                  className="tnum w-full rounded-full bg-white px-3 py-1.5 text-sm shadow-soft" />
                <span className="mt-0.5 block text-[11px] text-ink-soft">
                  {t(lang, "refund.capNote", { amount: formatPrice(refundPreview.amount, refundPreview.currency, lang), cap: formatPrice(refundPreview.cap, refundPreview.currency, lang) })}
                </span>
              </label>
            ) : (
              <p className="text-[12px] text-ink-soft">{t(lang, "refund.adminNoPreview")}</p>
            )}
            <button type="button" disabled={working || !adminReason.trim() || amountBad} onClick={adminCancel}
              className="btn bg-tomo-rose py-2 text-sm text-white">
              {working ? t(lang, "act.working") : t(lang, "refund.adminCancelProxySubmit")}
            </button>
          </div>
        </details>
      )}
      {notice && <p role="status" className="text-xs text-tomo-navy">{notice}</p>}
      {error && <p role="alert" className="text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}