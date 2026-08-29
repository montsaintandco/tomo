"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

const CATEGORIES = [
  ["figure","피규어"],["camera","카메라"],["fashion","패션"],["kpop","K-POP"],
  ["game","게임"],["vintage","빈티지"],["etc","기타"],
] as const;

export default function SellPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("etc");
  const [tradeMethod, setTradeMethod] = useState<"direct"|"shipping"|"both">("both");
  const [crossBorder, setCrossBorder] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const uploadedPaths: string[] = [];
    try {
      const { data: auth } = await supabase.auth.getUser();
      const images: string[] = [];
      for (const f of files.slice(0, 5)) {
        const path = `${auth.user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const { error: upErr } = await supabase.storage.from("listing-images").upload(path, f);
        if (upErr) throw upErr;
        uploadedPaths.push(path);
        images.push(supabase.storage.from("listing-images").getPublicUrl(path).data.publicUrl);
      }
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, price: parseInt(price, 10), category, tradeMethod, crossBorder, images }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/listings/${json.id}`);
    } catch (err) {
      // 리스팅이 만들어지지 못했으면 방금 올린 이미지는 고아 — 즉시 정리 (실패해도 무시)
      if (uploadedPaths.length > 0)
        await supabase.storage.from("listing-images").remove(uploadedPaths).catch(() => {});
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="font-brand mb-4 text-xl text-tomo-navy">판매하기 · 出品する</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm font-bold">사진 (최대 5장)
          <input type="file" accept="image/*" multiple className="mt-1 block w-full text-sm text-ink-soft"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <label className="text-sm font-bold">제목
          <input className="mt-1 w-full rounded-full bg-white px-4 py-3 font-normal shadow-[var(--shadow-soft)]" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
        </label>
        <label className="text-sm font-bold">설명
          <textarea className="mt-1 w-full rounded-card bg-white px-4 py-3 font-normal shadow-[var(--shadow-soft)]" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} />
        </label>
        <label className="text-sm font-bold">가격
          <input className="tnum mt-1 w-full rounded-full bg-white px-4 py-3 font-normal shadow-[var(--shadow-soft)]" type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <label className="text-sm font-bold">카테고리
          <select className="mt-1 w-full rounded-full bg-white px-4 py-3 font-normal shadow-[var(--shadow-soft)]" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-bold">거래 방법</legend>
          <div className="flex gap-2">
            {([["direct","직거래"],["shipping","배송"],["both","둘 다"]] as const).map(([v, l]) => (
              <button type="button" key={v} aria-pressed={tradeMethod === v}
                className={`btn flex-1 py-2 text-sm ${tradeMethod === v ? "bg-tomo-navy text-white shadow-[var(--shadow-soft)]" : "bg-white text-ink-soft"}`}
                onClick={() => setTradeMethod(v)}>{l}</button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" className="h-4 w-4 accent-[#C14E4C]" checked={crossBorder} onChange={(e) => setCrossBorder(e.target.checked)} />
          해외 판매 허용 (센터 경유 배송)
        </label>
        <button disabled={busy} className="btn bg-tomo-coral-deep py-3 text-white">
          {busy ? "등록 중…" : "등록하기 · 出品"}
        </button>
        {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
      </form>
    </main>
  );
}
