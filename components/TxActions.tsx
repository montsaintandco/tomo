"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

type Role = "buyer" | "seller" | "admin" | "other";
const DISPUTABLE = ["paid", "shipped", "shipped_to_center", "center_received", "shipped_international", "delivered"];
const ADMIN_CANCELABLE = ["paid", "shipped_to_center", "center_received"];   // DB admin_cancel_transaction과 정합

export default function TxActions({
  txId, status, isCrossBorder, role, meetup = false, lang = "ko",
}: { txId: string; status: string; isCrossBorder: boolean; role: Role; meetup?: boolean; lang?: Lang }) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tracking, setTracking] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const router = useRouter();
  const working = busy || isPending;
  const isParty = role === "buyer" || role === "seller";

  // 현재 상태·역할에서 허용되는 단일 액션 (DB advance_transaction과 정합)
  let action: { label: string; to: string; tracking?: boolean; outline?: boolean } | null = null;
  if (meetup && role === "buyer" && status === "paid") {
    action = { label: t(lang, "act.met"), to: "delivered" };            // 만남 거래: 구매자가 받았다고 확인
  } else if (meetup && role === "buyer" && status === "delivered") {
    action = { label: t(lang, "act.confirm"), to: "completed" };
  } else if (!meetup && role === "seller" && status === "paid") {
    action = isCrossBorder
      ? { label: t(lang, "act.shipToCenter"), to: "shipped_to_center", tracking: true }
      : { label: t(lang, "act.shipped"), to: "shipped", tracking: true };
  } else if (role === "buyer" && ((!isCrossBorder && status === "shipped") || (isCrossBorder && status === "shipped_international"))) {
    action = { label: t(lang, "act.received"), to: "delivered" };
  } else if (role === "buyer" && status === "delivered") {
    action = { label: t(lang, "act.confirm"), to: "completed" };
  } else if (role === "admin" && status === "shipped_to_center") {
    action = { label: t(lang, "act.centerIn"), to: "center_received" };
  } else if (role === "admin" && status === "center_received") {
    action = { label: t(lang, "act.intlShip"), to: "shipped_international", tracking: true };
  } else if (isParty && status === "pending_payment") {
    action = { label: t(lang, "act.cancelPay"), to: "cancelled", outline: true };
  }

  async function rpc(fn: string, args: Record<string, unknown>) {
    setBusy(true); setError("");
    const { error: e } = await createBrowserSupabase().rpc(fn, args);
    setBusy(false);
    if (e) { setError(e.message); return false; }
    startTransition(() => router.refresh());   // refresh 완료까지 잠금 — 새 상태의 다음 액션이 바로 눌리게
    return true;
  }

  const canDispute = isParty && DISPUTABLE.includes(status);
  const canResolve = role === "admin" && status === "disputed";
  const canAdminCancel = role === "admin" && ADMIN_CANCELABLE.includes(status);
  const canForceComplete = role === "admin" && status === "delivered";

  // 운영자 처리(환불이 걸린 일)는 서버 라우트로 — DB 상태 변경 후 토스 취소, 실패하면 환불 대기열
  async function adminCall(body: Record<string, unknown>) {
    if (!confirm(t(lang, "refund.confirm"))) return false;
    setBusy(true); setError(""); setNotice("");
    const res = await fetch("/api/admin/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(String(j.error ?? res.status)); return false; }
    setNotice(!j.refund ? t(lang, "refund.msgOk")
      : j.refund.status === "done" ? t(lang, "refund.msgDone") : t(lang, "refund.msgQueued", { error: String(j.refund.error ?? "") }));
    startTransition(() => router.refresh());
    return true;
  }

  if (!action && !canDispute && !canResolve && !canAdminCancel && !canForceComplete && !notice && !error) return null;

  return (
    <div className="flex flex-col gap-2">
      {action && (
        <>
          {action.tracking && (
            <>
              <label htmlFor="tx-tracking" className="sr-only">{t(lang, "act.tracking")}</label>
              <input id="tx-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)}
                placeholder={t(lang, "act.tracking")} maxLength={100} autoComplete="off"
                className="rounded-full bg-white px-4 py-2.5 text-base shadow-soft placeholder:text-ink-soft" />
            </>
          )}
          <button onClick={() => rpc("advance_transaction", { p_tx_id: txId, p_to: action!.to, p_tracking: action!.tracking ? (tracking.trim() || null) : null })}
            disabled={working}
            className={`btn w-full py-3 text-sm ${
              action.outline ? "border-[1.5px] border-tomo-navy bg-white text-tomo-navy" : "bg-tomo-coral-deep text-white"}`}>
            {working ? t(lang, "act.working") : action.label}
          </button>
        </>
      )}

      {/* 분쟁 신고 — 당사자, 결제 후 어느 단계든 (메루카리 「取引に関するお問い合わせ」 자리) */}
      {canDispute && (
        <div>
          <button type="button" onClick={() => setDisputeOpen(!disputeOpen)} aria-expanded={disputeOpen}
            className="press w-full py-2 text-center text-[12px] text-ink-soft underline underline-offset-2 hover:text-tomo-rose">
            {t(lang, "dispute.open")}
          </button>
          {disputeOpen && (
            <div className="reveal mt-1 flex flex-col gap-2 rounded-card bg-tomo-navy/5 p-3">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000}
                placeholder={t(lang, "dispute.reason")}
                className="w-full rounded-card bg-white px-3 py-2.5 text-base placeholder:text-ink-soft" />
              <button type="button" disabled={working || !reason.trim()}
                onClick={async () => { if (await rpc("open_dispute", { p_tx_id: txId, p_reason: reason.trim() })) setDisputeOpen(false); }}
                className="btn bg-tomo-rose py-2.5 text-sm text-white">
                {working ? t(lang, "act.working") : t(lang, "dispute.submit")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 운영자 분쟁 처리 — 정산(완료) 또는 환불(취소) */}
      {canResolve && (
        <div className="reveal flex flex-col gap-2 rounded-card bg-tomo-navy/5 p-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
            placeholder={t(lang, "dispute.note")}
            className="rounded-full bg-white px-4 py-2.5 text-base placeholder:text-ink-soft" />
          <div className="flex gap-2">
            <button type="button" disabled={working}
              onClick={() => adminCall({ type: "dispute", id: txId, to: "cancelled", reason: note.trim() })}
              className="btn flex-1 border-[1.5px] border-tomo-navy bg-white py-2.5 text-[13px] text-tomo-navy">
              {t(lang, "dispute.resolveRefund")}
            </button>
            <button type="button" disabled={working}
              onClick={() => adminCall({ type: "dispute", id: txId, to: "completed", reason: note.trim() })}
              className="btn flex-1 bg-tomo-coral-deep py-2.5 text-[13px] text-white">
              {t(lang, "dispute.resolveRelease")}
            </button>
          </div>
        </div>
      )}
      {/* 운영자 거래 취소 — 결제 후 센터 단계까지, 결제 금액 전부 환불 */}
      {canAdminCancel && (
        <details className="rounded-card bg-tomo-navy/5 p-3">
          <summary className="cursor-pointer text-[13px] font-bold text-tomo-rose">{t(lang, "refund.adminCancelTx")}</summary>
          <div className="reveal mt-2 flex flex-col gap-2">
            <p className="text-[12px] text-ink-soft">{t(lang, "refund.adminCancelTxNote")}</p>
            <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={1000}
              placeholder={t(lang, "refund.reasonPh")}
              className="rounded-full bg-white px-4 py-2.5 text-base placeholder:text-ink-soft" />
            <button type="button" disabled={working || !cancelReason.trim()}
              onClick={() => adminCall({ type: "tx", id: txId, reason: cancelReason.trim() })}
              className="btn bg-tomo-rose py-2.5 text-sm text-white">
              {working ? t(lang, "act.working") : t(lang, "refund.adminCancelTx")}
            </button>
          </div>
        </details>
      )}

      {/* 운영자 강제 구매확정 — 배송 도착 후 구매자가 확인을 안 할 때 */}
      {canForceComplete && (
        <details className="rounded-card bg-tomo-navy/5 p-3">
          <summary className="cursor-pointer text-[13px] font-bold text-tomo-navy">{t(lang, "refund.adminComplete")}</summary>
          <div className="reveal mt-2 flex flex-col gap-2">
            <p className="text-[12px] text-ink-soft">{t(lang, "refund.adminCompleteNote")}</p>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000}
              placeholder={t(lang, "refund.notePh")}
              className="rounded-full bg-white px-4 py-2.5 text-base placeholder:text-ink-soft" />
            <button type="button" disabled={working}
              onClick={() => adminCall({ type: "complete", id: txId, reason: note.trim() })}
              className="btn bg-tomo-coral-deep py-2.5 text-sm text-white">
              {working ? t(lang, "act.working") : t(lang, "refund.adminComplete")}
            </button>
          </div>
        </details>
      )}
      {notice && <p role="status" className="text-xs text-tomo-navy">{notice}</p>}
      {error && <p role="alert" className="text-xs text-tomo-rose">{error}</p>}
    </div>
  );
}
