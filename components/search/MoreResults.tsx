"use client";
import { useState } from "react";
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import type { MercariMore } from "@/lib/market/search";
import type { Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";

// 메루카리 다음 페이지를 이어 붙인다(36건씩). 첫 페이지와 같은 번역 검색어·필터(엔)로 /api/global/search?mt= 를 부른다
export default function MoreResults({ lang, rate, viewerCurrency, more, seen }: {
  lang: Lang; rate: number; viewerCurrency: Currency; more: MercariMore; seen: string[];
}) {
  const [items, setItems] = useState<ExternalCardItem[]>([]);
  const [next, setNext] = useState<string | null>(more.token);
  const [state, setState] = useState<"idle" | "loading" | "fail">("idle");

  async function load() {
    if (!next || state === "loading") return;
    setState("loading");
    const p = new URLSearchParams({ mt: next, term: more.term, lang, sort: more.f.sort ?? "rec" });
    if (more.f.min) p.set("min", String(more.f.min));
    if (more.f.max) p.set("max", String(more.f.max));
    if (more.f.cond) p.set("cond", more.f.cond);
    if (more.f.sold) p.set("sold", "1");
    if (more.f.catIds?.length) p.set("cats", more.f.catIds.join(","));
    try {
      const res = await fetch(`/api/global/search?${p.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { items: ExternalCardItem[]; next: string | null };
      setItems((prev) => {
        const have = new Set([...seen, ...prev.map((i) => i.sourceId)]);
        return [...prev, ...j.items.filter((i) => !have.has(i.sourceId))];
      });
      setNext(j.next);
      setState("idle");
    } catch {
      setState("fail");
    }
  }

  return (
    <>
      {items.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:mt-7 md:grid-cols-4 md:gap-x-5 md:gap-y-7 lg:grid-cols-5">
          {items.map((it) => <ExternalItemCard key={`${it.source}-${it.sourceId}`} item={it} rate={rate} viewerCurrency={viewerCurrency} lang={lang} />)}
        </div>
      )}
      {next && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {state === "fail" && <p className="text-[12px] text-ink-soft" role="alert">{t(lang, "search.moreFail")}</p>}
          <button type="button" onClick={load} disabled={state === "loading"} aria-busy={state === "loading"}
            className="btn min-h-11 border border-tomo-navy/15 bg-white px-6 text-sm text-ink disabled:opacity-60">
            {state === "loading" ? "…" : t(lang, "search.more")}
          </button>
        </div>
      )}
    </>
  );
}