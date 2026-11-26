"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedGuard } from "@/components/admin/use-unsaved-guard";

// 운영자 상품 제목·가격 수정 — /api/admin/listings → admin_update_listing(0037). 진행 중 거래가 있으면 가격 칸은 잠근다(DB도 거부)
export default function ListingEditForm({ id, title, price, currency, priceLocked }: {
  id: string; title: string; price: number; currency: string; priceLocked: boolean;
}) {
  const [t, setT] = useState(title);
  const [p, setP] = useState(String(price));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = t.trim() !== title || p.trim() !== String(price);
  useUnsavedGuard(dirty);

  const priceNum = Number(p);
  const priceBad = !Number.isInteger(priceNum) || priceNum < 0 || priceNum > 100_000_000;
  const titleBad = t.trim().length < 1 || t.trim().length > 80;

  async function save() {
    setBusy(true); setError(""); setDone("");
    const res = await fetch("/api/admin/listings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: t.trim() !== title ? t.trim() : null, price: p.trim() !== String(price) ? priceNum : null, note: note.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(String(j.error ?? res.status)); return; }
    setNote("");
    setDone(j.translated === false ? "저장했어요. 번역 제목은 갱신하지 못했어요" : "저장했어요");
    startTransition(() => router.refresh());
  }

  const off = busy || isPending;
  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="a-muted mb-1 block text-[12px]">제목 <span className="tnum">{t.trim().length}/80</span></span>
        <input value={t} onChange={(e) => setT(e.target.value)} maxLength={80} className="h-9 w-full px-3 text-[13px]" />
      </label>
      <label className="block">
        <span className="a-muted mb-1 block text-[12px]">가격({currency === "JPY" ? "엔" : "원"}, 0 = 나눔)</span>
        <input type="number" inputMode="numeric" min={0} max={100_000_000} step={1} value={p} disabled={priceLocked}
          onChange={(e) => setP(e.target.value)} className="tnum h-9 w-full px-3 text-[13px] disabled:opacity-60" />
        {priceLocked && <span className="mt-1 block text-[12px] text-tomo-coral-deep">진행 중 거래가 있어 가격은 바꿀 수 없어요. 제목만 고칠 수 있어요.</span>}
      </label>
      <label className="block">
        <span className="a-muted mb-1 block text-[12px]">메모(활동 기록에 남아요)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="예: 금지어 수정" className="h-9 w-full px-3 text-[13px]" />
      </label>
      <p className="a-faint text-[12px]">가격을 내리면 찜한 사람에게 가격 인하 알림이 가요.</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={off || !dirty || titleBad || (!priceLocked && priceBad)}
          className="btn h-9 bg-tomo-navy px-4 text-[13px] text-white disabled:opacity-45">{off ? "저장 중…" : "저장"}</button>
        {dirty && <button type="button" disabled={off} onClick={() => { setT(title); setP(String(price)); }} className="a-link text-[12px]">되돌리기</button>}
      </div>
      {done && <p role="status" className="text-[12px] text-tomo-navy">{done}</p>}
      {error && <p role="alert" className="text-[12px] text-tomo-rose">{error}</p>}
    </div>
  );
}
