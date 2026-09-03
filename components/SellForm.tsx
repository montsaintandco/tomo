"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

const CATEGORIES = ["figure", "camera", "fashion", "kpop", "game", "vintage", "etc"] as const;
const METHODS = ["direct", "shipping", "both"] as const;
const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
const PAYERS = ["seller", "buyer"] as const;
const SHIP_DAYS = ["1_2", "2_3", "4_7"] as const;
const SEG = "btn flex-1 py-3 text-sm";
const segOn = (on: boolean) => `${SEG} ${on ? "bg-tomo-navy text-white shadow-soft" : "bg-white text-ink-soft shadow-soft"}`;
const FIELD = "mt-1 w-full rounded-full bg-white px-4 py-3 text-base font-normal shadow-soft placeholder:text-ink-soft";

export default function SellForm({ lang, hint }: { lang: Lang; hint: string }) {
  const [title, setTitle] = useState(hint);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("etc");
  const [tradeMethod, setTradeMethod] = useState<(typeof METHODS)[number]>("both");
  const [crossBorder, setCrossBorder] = useState(true);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>("good");
  const [shippingPayer, setShippingPayer] = useState<(typeof PAYERS)[number]>("seller");
  const [shipDays, setShipDays] = useState<(typeof SHIP_DAYS)[number]>("2_3");
  const [allowOffers, setAllowOffers] = useState(true);
  const [free, setFree] = useState(false);
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
        body: JSON.stringify({
          title, description, price: free ? 0 : parseInt(price, 10), category, tradeMethod, crossBorder, images,
          condition, shippingPayer, shipDays, allowOffers: !free && allowOffers,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/listings/${json.id}`);
    } catch (err) {
      // 리스팅이 만들어지지 못했으면 방금 올린 이미지는 고아 — 즉시 정리 (실패해도 무시)
      if (uploadedPaths.length > 0)
        await supabase.storage.from("listing-images").remove(uploadedPaths).catch(() => {});
      setError(err instanceof Error ? err.message : t(lang, "sell.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "sell.title")}</h1>
      <p className="mb-4 mt-0.5 text-[12px] text-ink-soft">{t(lang, "sell.sub")}</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="text-[13px] font-bold text-ink">{t(lang, "sell.photos")}
          <input type="file" accept="image/*" multiple className="mt-1 block w-full text-sm font-normal text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-tomo-navy/5 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-tomo-navy"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        <label className="text-[13px] font-bold text-ink">{t(lang, "sell.name")}
          <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
        </label>
        <label className="text-[13px] font-bold text-ink">{t(lang, "sell.desc")}
          <textarea className="mt-1 w-full rounded-card bg-white px-4 py-3 text-base font-normal shadow-soft" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} />
        </label>
        <label className="text-[13px] font-bold text-ink">{t(lang, "sell.price")}
          <input className={`tnum ${FIELD} disabled:opacity-45`} type="number" inputMode="numeric" min={1}
            value={free ? "" : price} onChange={(e) => setPrice(e.target.value)} required={!free} disabled={free} />
        </label>
        <label className="-mt-2 flex items-center gap-2 text-[13px] font-bold text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[#C14E4C]" checked={free} onChange={(e) => setFree(e.target.checked)} />
          {t(lang, "sell.free")}
        </label>
        <label className="text-[13px] font-bold text-ink">{t(lang, "sell.condition")}
          <select className={FIELD} value={condition} onChange={(e) => setCondition(e.target.value as (typeof CONDITIONS)[number])}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{t(lang, `cond.${c}`)}</option>)}
          </select>
        </label>
        <label className="text-[13px] font-bold text-ink">{t(lang, "sell.category")}
          <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(lang, `cat.${c}`)}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="mb-1 text-[13px] font-bold text-ink">{t(lang, "sell.method")}</legend>
          <div className="flex gap-2">
            {METHODS.map((m) => (
              <button type="button" key={m} aria-pressed={tradeMethod === m}
                className={`btn flex-1 py-2.5 text-sm ${tradeMethod === m ? "bg-tomo-navy text-white shadow-soft" : "bg-white text-ink-soft shadow-soft"}`}
                onClick={() => setTradeMethod(m)}>{t(lang, `method.${m}`)}</button>
            ))}
          </div>
        </fieldset>
        {tradeMethod !== "direct" && (
          <>
            <fieldset>
              <legend className="mb-1 text-[13px] font-bold text-ink">{t(lang, "sell.payer")}</legend>
              <div className="flex gap-2">
                {PAYERS.map((p) => (
                  <button type="button" key={p} aria-pressed={shippingPayer === p} className={segOn(shippingPayer === p)}
                    onClick={() => setShippingPayer(p)}>{t(lang, `payer.${p}`)}</button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-[13px] font-bold text-ink">{t(lang, "sell.days")}</legend>
              <div className="flex gap-2">
                {SHIP_DAYS.map((d) => (
                  <button type="button" key={d} aria-pressed={shipDays === d} className={segOn(shipDays === d)}
                    onClick={() => setShipDays(d)}>{t(lang, `days.${d}`)}</button>
                ))}
              </div>
            </fieldset>
          </>
        )}
        <label className="flex items-center gap-2 text-[13px] font-bold text-ink">
          <input type="checkbox" className="h-4 w-4 accent-[#C14E4C]" checked={crossBorder} onChange={(e) => setCrossBorder(e.target.checked)} />
          {t(lang, "sell.crossBorder")}
        </label>
        {!free && (
          <label className="flex items-center gap-2 text-[13px] font-bold text-ink">
            <input type="checkbox" className="h-4 w-4 accent-[#C14E4C]" checked={allowOffers} onChange={(e) => setAllowOffers(e.target.checked)} />
            {t(lang, "sell.allowOffers")}
          </label>
        )}
        <button disabled={busy} className="btn bg-tomo-coral-deep py-3 text-sm text-white">
          {busy ? t(lang, "sell.submitting") : t(lang, "sell.submit")}
        </button>
        {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
      </form>
    </main>
  );
}
