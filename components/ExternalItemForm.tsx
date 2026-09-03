"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

const FIELD = "rounded-full bg-white px-4 py-2.5 text-base shadow-soft placeholder:text-ink-soft";

// 당근·중고나라 상품 수동 등록 (admin RLS가 권한 보장). 운영자 화면은 한국어 고정
export default function ExternalItemForm() {
  const [source, setSource] = useState("daangn");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function save() {
    setBusy(true); setMsg("");
    // 상품 링크 끝의 식별자를 source_id로 사용 (없으면 타임스탬프)
    const idFromUrl = url.trim().split(/[/?#]/).filter(Boolean).pop() ?? "";
    const sourceId = idFromUrl.slice(0, 60) || `manual-${Date.now()}`;
    const supabase = createBrowserSupabase();
    const { error } = await supabase.from("external_items").insert({
      source, source_id: sourceId, url: url.trim(), title: title.trim(),
      price: Math.max(0, Math.round(Number(price) || 0)), currency: "KRW",
      images: image.trim() ? [image.trim()] : [], status: "active",
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setUrl(""); setTitle(""); setPrice(""); setImage("");
    setMsg("등록했어요");
    startTransition(() => router.refresh());
  }

  const ready = url.trim() && title.trim() && Number(price) > 0;

  return (
    <div className="card flex flex-col gap-2 p-3.5">
      <div className="flex gap-1.5" role="group" aria-label="소스">
        {["daangn", "joongna"].map((s) => (
          <button key={s} type="button" onClick={() => setSource(s)} aria-pressed={source === s}
            className={`press rounded-full px-3.5 py-2 text-[13px] font-bold ${
              source === s ? "bg-tomo-navy text-white shadow-soft" : "bg-tomo-navy/5 text-ink-soft"}`}>
            {s === "daangn" ? "당근마켓" : "중고나라"}
          </button>
        ))}
      </div>
      <label htmlFor="ext-url" className="sr-only">상품 링크</label>
      <input id="ext-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="상품 링크 (필수)" className={FIELD} inputMode="url" />
      <label htmlFor="ext-title" className="sr-only">상품명</label>
      <input id="ext-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="상품명 (필수)" className={FIELD} />
      <label htmlFor="ext-price" className="sr-only">가격</label>
      <input id="ext-price" value={price} onChange={(e) => setPrice(e.target.value)} type="number" inputMode="numeric" min={0} placeholder="가격 (원, 필수)" className={`tnum ${FIELD}`} />
      <label htmlFor="ext-image" className="sr-only">이미지 URL</label>
      <input id="ext-image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="이미지 URL (선택)" className={FIELD} inputMode="url" />
      <button onClick={save} disabled={busy || isPending || !ready}
        className="btn bg-tomo-coral-deep py-2.5 text-sm text-white">
        {busy ? "등록 중…" : "등록"}
      </button>
      {msg && <p role="status" className="text-center text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
