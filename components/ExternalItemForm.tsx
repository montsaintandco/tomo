"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

// 당근·중고나라 상품 수동 등록 (admin RLS가 권한 보장)
export default function ExternalItemForm() {
  const [source, setSource] = useState("daangn");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
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
    if (error) { setMsg(error.message); setBusy(false); return; }
    setUrl(""); setTitle(""); setPrice(""); setImage("");
    setMsg("등록했어요");
    setBusy(false);
    router.refresh();
  }

  const ready = url.trim() && title.trim() && Number(price) > 0;

  return (
    <div className="flex flex-col gap-2 rounded-card border bg-white p-3">
      <div className="flex gap-2">
        {["daangn", "joongna"].map((s) => (
          <button key={s} onClick={() => setSource(s)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              source === s ? "bg-tomo-navy text-white" : "border text-ink-soft"}`}>
            {s === "daangn" ? "당근마켓" : "중고나라"}
          </button>
        ))}
      </div>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="상품 링크 (필수)"
        className="rounded-card border px-3 py-2 text-sm" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="상품명 (필수)"
        className="rounded-card border px-3 py-2 text-sm" />
      <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} placeholder="가격 (원, 필수)"
        className="rounded-card border px-3 py-2 text-sm" />
      <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="이미지 URL (선택)"
        className="rounded-card border px-3 py-2 text-sm" />
      <button onClick={save} disabled={busy || !ready}
        className="rounded-full bg-tomo-coral-deep py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "등록 중…" : "등록"}
      </button>
      {msg && <p className="text-center text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
