"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type I18nKey, type Lang } from "@/lib/i18n";
import PriceHint from "@/components/PriceHint";
import { mergePhotos, resizeImage } from "@/lib/image-resize";
import { LISTING_CATEGORIES, isListingCategory, listingCategoryName } from "@/lib/categories";

const METHODS = ["direct", "shipping", "both"] as const;
const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
const PAYERS = ["seller", "buyer"] as const;
const SHIP_DAYS = ["1_2", "2_3", "4_7"] as const;
const MAX_PHOTOS = 5;
const SEG = "btn flex-1 py-3 text-sm";
const segOn = (on: boolean) => `${SEG} ${on ? "bg-tomo-navy text-white shadow-soft" : "bg-white text-ink-soft shadow-soft"}`;
const INPUT = "w-full rounded-full bg-white px-4 py-3 text-base font-normal shadow-soft placeholder:text-ink-soft";
const FIELD = `mt-1 ${INPUT}`;
const LABEL = "text-[13px] font-bold text-ink";

export type SellInitial = {
  id: string; title: string; description: string; price: number; category: string; trade_method: string;
  cross_border_enabled: boolean; condition: string; shipping_payer: string; ship_days: string; allow_offers: boolean;
  images?: string[];
};
const pick = <T extends readonly string[]>(list: T, v: string | undefined, d: T[number]): T[number] =>
  (list as readonly string[]).includes(v ?? "") ? (v as T[number]) : d;

// 크로스리스팅 프리필 — 사진은 API가 우리 저장소 주소만 받으므로 넘기지 않는다(직접 올린다)
export type SellPrefill = { title: string; description: string; price?: number };

// 사용자에게 보여줄 오류 — 영어 원문(API·저장소) 대신 화면 언어 문구
class SellError extends Error {}

// initial이 있으면 수정 모드 (PATCH /api/listings/[id]) — 같은 폼, 같은 검증
export default function SellForm({ lang, hint, initial, prefill, importMsg, currency = "KRW" }: {
  lang: Lang; hint: string; initial?: SellInitial; prefill?: SellPrefill; importMsg?: string; currency?: "KRW" | "JPY";
}) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? hint);
  const [description, setDescription] = useState(initial?.description ?? prefill?.description ?? "");
  const [price, setPrice] = useState(initial && initial.price > 0 ? String(initial.price) : prefill?.price ? String(prefill.price) : "");
  // 카테고리 = lib/categories.ts 대분류 + etc. 예전 값(fashion 등)으로 올린 상품을 고칠 때는 그 값을 목록에 남겨 바뀌지 않게 한다
  const [category, setCategory] = useState<string>(isListingCategory(initial?.category) ? initial!.category! : "etc");
  const categoryOptions = LISTING_CATEGORIES.includes(category) ? LISTING_CATEGORIES : [...LISTING_CATEGORIES, category];
  const [tradeMethod, setTradeMethod] = useState<(typeof METHODS)[number]>(pick(METHODS, initial?.trade_method, "both"));
  const [crossBorder, setCrossBorder] = useState(initial?.cross_border_enabled ?? true);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>(pick(CONDITIONS, initial?.condition, "good"));
  const [shippingPayer, setShippingPayer] = useState<(typeof PAYERS)[number]>(pick(PAYERS, initial?.shipping_payer, "seller"));
  const [shipDays, setShipDays] = useState<(typeof SHIP_DAYS)[number]>(pick(SHIP_DAYS, initial?.ship_days, "2_3"));
  const [allowOffers, setAllowOffers] = useState(initial?.allow_offers ?? true);
  const [free, setFree] = useState(initial ? initial.price === 0 : false);
  const [files, setFiles] = useState<File[]>([]);
  const [photoNote, setPhotoNote] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addFiles(list: FileList | null) {
    const { files: next, dropped } = mergePhotos(files, Array.from(list ?? []), MAX_PHOTOS);
    setFiles(next);
    setPhotoNote(dropped > 0 ? t(lang, "sell.photoMax", { n: MAX_PHOTOS }) : "");
  }

  // 가격 단위 — lib/price-display formatMoney 규칙과 같다(엔 ¥ 앞, 원화는 한국어 「원」 뒤 · 일본어 ₩ 앞)
  const unit = currency === "JPY" ? { text: "¥", before: true } : lang === "ja" ? { text: "₩", before: true } : { text: "원", before: false };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const supabase = createBrowserSupabase();
    const uploadedPaths: string[] = [];
    const fail = (key: I18nKey) => new SellError(t(lang, key));
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw fail("sell.errLogin");
      const images: string[] = [];
      for (const f of files.slice(0, MAX_PHOTOS)) {
        const path = `${auth.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: upErr } = await supabase.storage.from("listing-images").upload(path, await resizeImage(f), { contentType: "image/jpeg" });
        if (upErr) throw fail("sell.errUpload");
        uploadedPaths.push(path);
        images.push(supabase.storage.from("listing-images").getPublicUrl(path).data.publicUrl);
      }
      const res = await fetch(editing ? `/api/listings/${initial!.id}` : "/api/listings", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, description, price: free ? 0 : parseInt(price, 10), category, tradeMethod, crossBorder, images,
          condition, shippingPayer, shipDays, allowOffers: !free && allowOffers,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw fail(res.status === 429 ? "sell.errRate" : res.status === 401 ? "sell.errLogin" : "sell.errSave");
      router.push(`/listings/${json.id}`);
      if (editing) router.refresh();
    } catch (err) {
      // 리스팅이 만들어지지 못했으면 방금 올린 이미지는 고아 — 즉시 정리 (실패해도 무시)
      if (uploadedPaths.length > 0)
        await supabase.storage.from("listing-images").remove(uploadedPaths).catch(() => {});
      setError(err instanceof SellError ? err.message : t(lang, "sell.fail"));
    } finally {
      setBusy(false);
    }
  }

  const existing = editing && files.length === 0 ? initial?.images ?? [] : [];

  return (
    <main className="mx-auto max-w-md p-4 pb-8 standalone:pb-24 md:max-w-5xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, editing ? "sell.editTitle" : "sell.title")}</h1>
      <p className="mb-4 mt-0.5 text-[12px] text-ink-soft">{t(lang, editing ? "sell.imagesKeep" : "sell.sub")}</p>
      {!editing && (
        <form method="get" action="/sell" className="mb-5 rounded-card bg-tomo-navy/5 p-3.5">
          <label htmlFor="sell-from" className="block text-[13px] font-bold text-ink">{t(lang, "sell.import")}</label>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">{t(lang, "sell.importHint")}</p>
          <div className="mt-2 flex gap-2">
            <input id="sell-from" name="from" type="url" inputMode="url" placeholder="https://jp.mercari.com/item/…"
              className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-base font-normal shadow-soft placeholder:text-ink-soft" />
            <button className="btn shrink-0 bg-tomo-navy px-4 py-2 text-sm text-white">{t(lang, "sell.importGo")}</button>
          </div>
          {importMsg && <p role="status" className="mt-2 text-[12px] font-bold text-tomo-navy">{importMsg}</p>}
        </form>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-8">
        <div className="flex flex-col gap-4">
          {/* 사진 — 끌어놓기 또는 눌러서 고르기. 기본 「파일 선택」 버튼은 숨긴다(입력은 안에 있어 키보드로도 연다) */}
          <div>
            <p className={`${LABEL} flex items-baseline justify-between`}>
              {t(lang, "sell.photos")}
              <span className="tnum text-[12px] font-normal text-ink-soft">{files.length}/{MAX_PHOTOS}</span>
            </p>
            <label
              onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              className={`mt-1 flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed p-4 text-center transition-colors focus-within:ring-2 focus-within:ring-tomo-navy md:min-h-44 ${
                drag ? "border-tomo-navy bg-tomo-navy/5" : "border-tomo-navy/15 bg-white hover:border-tomo-navy/40"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-ink-soft" aria-hidden>
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="text-[13px] font-bold text-ink">{t(lang, "sell.photoDrop")}</span>
              <span className="text-[12px] text-ink-soft">{t(lang, "sell.photoDropHint", { n: MAX_PHOTOS })}</span>
              <input type="file" accept="image/*" multiple className="sr-only"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {photoNote && <p role="status" className="mt-1.5 text-[12px] font-bold text-tomo-rose">{photoNote}</p>}
            {(previews.length > 0 || existing.length > 0) && (
              <ul className="mt-2 grid grid-cols-5 gap-2">
                {(previews.length > 0 ? previews : existing).map((src, i) => (
                  <li key={src} className="relative aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[11px] font-bold text-white">{t(lang, "sell.photoCover")}</span>}
                    {previews.length > 0 && (
                      <button type="button" aria-label={t(lang, "sell.photoRemove", { n: i + 1 })}
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-[13px] leading-none text-white">×</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className={LABEL}>{t(lang, "sell.name")}
            <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} />
          </label>
          <label className={LABEL}>{t(lang, "sell.desc")}
            <textarea className="mt-1 w-full rounded-card bg-white px-4 py-3 text-base font-normal shadow-soft md:min-h-48" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={2000} />
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="sell-price" className={LABEL}>{t(lang, "sell.price")}</label>
            {/* 시세 버튼은 입력 칸 옆 — PriceHint 겉 div 를 contents 로 풀어 버튼·결과를 이 줄에 놓는다 */}
            <div className="mt-1 flex flex-wrap items-center gap-2 [&>div:last-child>button]:shrink-0 [&>div:last-child>button]:py-2.5 [&>div:last-child]:contents [&_p]:basis-full">
              <div className="relative min-w-[9rem] flex-1">
                <input id="sell-price" className={`tnum ${INPUT} disabled:opacity-45 ${unit.before ? "pl-9" : "pr-10"}`} type="number" inputMode="numeric" min={1}
                  value={free ? "" : price} onChange={(e) => setPrice(e.target.value)} required={!free} disabled={free} aria-describedby="sell-price-unit" />
                <span id="sell-price-unit" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[15px] font-bold text-ink-soft ${unit.before ? "left-4" : "right-4"}`}>{unit.text}</span>
              </div>
              {!free && <PriceHint title={title} currency={currency} lang={lang} onApply={(p) => setPrice(String(p))} />}
            </div>
          </div>
          <label className={`-mt-2 flex items-center gap-2 ${LABEL}`}>
            <input type="checkbox" className="h-4 w-4 accent-[#1D4ED8]" checked={free} onChange={(e) => setFree(e.target.checked)} />
            {t(lang, "sell.free")}
          </label>
          <label className={LABEL}>{t(lang, "sell.condition")}
            <select className={FIELD} value={condition} onChange={(e) => setCondition(e.target.value as (typeof CONDITIONS)[number])}>
              {CONDITIONS.map((c) => <option key={c} value={c}>{t(lang, `cond.${c}`)}</option>)}
            </select>
          </label>
          <label className={LABEL}>{t(lang, "sell.category")}
            <select className={FIELD} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((c) => <option key={c} value={c}>{listingCategoryName(lang, c)}</option>)}
            </select>
          </label>
          <fieldset>
            <legend className={`mb-1 ${LABEL}`}>{t(lang, "sell.method")}</legend>
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
                <legend className={`mb-1 ${LABEL}`}>{t(lang, "sell.payer")}</legend>
                <div className="flex gap-2">
                  {PAYERS.map((p) => (
                    <button type="button" key={p} aria-pressed={shippingPayer === p} className={segOn(shippingPayer === p)}
                      onClick={() => setShippingPayer(p)}>{t(lang, `payer.${p}`)}</button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className={`mb-1 ${LABEL}`}>{t(lang, "sell.days")}</legend>
                <div className="flex gap-2">
                  {SHIP_DAYS.map((d) => (
                    <button type="button" key={d} aria-pressed={shipDays === d} className={segOn(shipDays === d)}
                      onClick={() => setShipDays(d)}>{t(lang, `days.${d}`)}</button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          <label className={`flex items-center gap-2 ${LABEL}`}>
            <input type="checkbox" className="h-4 w-4 accent-[#1D4ED8]" checked={crossBorder} onChange={(e) => setCrossBorder(e.target.checked)} />
            {t(lang, "sell.crossBorder")}
          </label>
          {!free && (
            <label className={`flex items-center gap-2 ${LABEL}`}>
              <input type="checkbox" className="h-4 w-4 accent-[#1D4ED8]" checked={allowOffers} onChange={(e) => setAllowOffers(e.target.checked)} />
              {t(lang, "sell.allowOffers")}
            </label>
          )}
          <button disabled={busy} className="btn bg-tomo-coral-deep py-3 text-sm text-white">
            {busy ? t(lang, "sell.submitting") : t(lang, editing ? "sell.update" : "sell.submit")}
          </button>
          {error && <p role="alert" className="text-sm text-tomo-rose">{error}</p>}
        </div>
      </form>
    </main>
  );
}
