"use client";
import { useState } from "react";
import { t, type Lang } from "@/lib/i18n";

export type ReportTarget = "listing" | "user" | "conversation";
const REASONS = ["spam", "fraud", "prohibited", "abuse", "other"] as const;

// 신고 사유 고르기 → /api/report. 접수되면 onDone. 바닥 시트(모바일)·가운데 창(데스크톱)
export default function ReportSheet({ targetType, targetId, lang, onClose }: {
  targetType: ReportTarget; targetId: string; lang: Lang; onClose: () => void;
}) {
  const [reason, setReason] = useState<(typeof REASONS)[number] | "">("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, detail: detail.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t(lang, "trust.err.failed"));
    } finally { setBusy(false); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t(lang, "trust.report.title")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8 md:rounded-2xl md:pb-5" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <p role="status" className="text-[15px] font-bold text-ink">{t(lang, "trust.report.done")}</p>
            <button type="button" onClick={onClose} className="btn mt-4 w-full bg-tomo-navy py-3 text-sm text-white">OK</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="text-[15px] font-bold text-ink">{t(lang, "trust.report.title")}</p>
            <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "trust.report.sub")}</p>
            <fieldset className="mt-3 flex flex-col">
              <legend className="sr-only">{t(lang, "trust.report.title")}</legend>
              {REASONS.map((r) => (
                <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-ink">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4" />
                  {t(lang, `trust.reason.${r}`)}
                </label>
              ))}
            </fieldset>
            <label htmlFor="report-detail" className="mt-2 block text-[12px] text-ink-soft">{t(lang, "trust.report.detail")}</label>
            <textarea id="report-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000} rows={3}
              className="mt-1 w-full rounded-xl bg-tomo-ivory p-3 text-base" />
            {error && <p role="alert" className="mt-1 text-[12px] text-tomo-rose">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="btn flex-1 border-[1.5px] border-tomo-navy/20 bg-white py-3 text-sm text-ink">
                {t(lang, "trust.report.cancel")}
              </button>
              <button disabled={!reason || busy} className="btn flex-1 bg-tomo-rose py-3 text-sm text-white">
                {t(lang, "trust.report.send")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
