"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice } from "@/lib/currency";

// 고정 바에는 버튼 하나만. 누르면 네이티브 <dialog> 바텀시트에서 요청사항·묶음배송·(경매면) 최대 입찰가를 받고 확정한다
// — 오류 예방 단계이자 바 오버플로 해결. 모든 입력은 note 한 필드로 어드민 큐에 전달 (스키마 변경 없음)
export default function ProxyRequestButton({ lang = "ko", auction = false, totalLabel, ...props }: {
  source: string; sourceId: string; title: string; price: number;
  currency: "KRW" | "JPY"; url: string; images: string[]; sellerName: string;
  lang?: Lang; auction?: boolean; totalLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [bundle, setBundle] = useState(false);
  const [maxBid, setMaxBid] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setMsg("");
    try {
      const parts = [
        bundle ? t(lang, "ext.bundleTag") : "",
        auction && maxBid ? t(lang, "ext.maxBidTag", { v: formatPrice(Number(maxBid), props.currency) }) : "",
        note.trim(),
      ].filter(Boolean);
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...props, note: parts.join(" ") }),
      });
      const json = await res.json().catch(() => ({}));
      // 503 = 서비스 준비 중 — 오류가 아니라 대기 상태 (안전결제와 동일 관행)
      if (res.status === 503) { setMsg(t(lang, "ext.requestPending")); setBusy(false); return; }
      if (!res.ok) throw new Error(json.error || t(lang, "ext.requestFail"));
      router.push(`/proxy/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "ext.requestFail"));
      setBusy(false);
    }
  }

  const cta = auction ? t(lang, "ext.bidRequest") : t(lang, "ext.request");
  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}
        className="btn w-full bg-tomo-coral-deep py-3 text-sm text-white">
        {cta}
      </button>

      <dialog ref={dialogRef} aria-labelledby="proxy-confirm-title"
        className="m-0 mt-auto w-full max-w-md rounded-t-card bg-white p-0 shadow-lift backdrop:bg-tomo-navy/40 md:m-auto md:rounded-card">
        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          <h2 id="proxy-confirm-title" className="text-[17px] font-extrabold text-ink">{t(lang, "ext.confirmTitle")}</h2>
          <div className="rounded-card bg-tomo-navy/5 p-3.5">
            <p className="line-clamp-2 text-[13px] text-ink">{props.title}</p>
            {totalLabel && <p className="tnum mt-1 text-[17px] font-extrabold text-tomo-navy">{totalLabel}</p>}
            <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "ext.confirmNote")}</p>
          </div>

          {auction && (
            <label className="text-[12px] font-bold text-ink">
              {t(lang, "ext.maxBid")} ({props.currency === "JPY" ? "¥" : "₩"})
              <input type="number" inputMode="numeric" min={props.price} step={props.currency === "JPY" ? 10 : 100}
                value={maxBid} onChange={(e) => setMaxBid(e.target.value)} required
                className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-normal shadow-soft placeholder:text-ink-soft"
                placeholder={String(props.price)} />
            </label>
          )}
          <label className="text-[12px] font-bold text-ink">
            {t(lang, "ext.noteLabel")}
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
              placeholder={t(lang, "ext.notePlaceholder")}
              className="mt-1 w-full rounded-full bg-white px-4 py-2.5 text-base font-normal shadow-soft placeholder:text-ink-soft" />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-[12px] font-bold text-ink">
            <input type="checkbox" className="h-4 w-4 accent-tomo-coral-deep" checked={bundle} onChange={(e) => setBundle(e.target.checked)} />
            {t(lang, "ext.bundle")}
          </label>

          {msg && <p className="text-center text-xs text-ink-soft">{msg}</p>}
          {error && <p role="alert" className="text-center text-xs text-tomo-rose">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} disabled={busy}
              className="press flex-1 rounded-full bg-tomo-navy/5 py-3 text-sm font-bold text-ink">
              {t(lang, "ext.cancel")}
            </button>
            <button type="submit" disabled={busy} className="btn flex-[2] bg-tomo-coral-deep py-3 text-sm text-white">
              {busy ? t(lang, "ext.requesting") : t(lang, "ext.confirm")}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
