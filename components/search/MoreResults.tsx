"use client";
import { useState } from "react";
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import type { MercariMore } from "@/lib/market/search";
import type { Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import { wishKey } from "@/components/search/wish";

// 메루카리 다음 페이지를 이어 붙인다(36건씩). 첫 페이지와 같은 번역 검색어·필터(엔)로 /api/global/search?mt= 를 부른다.
// 로그인 사용자는 새로 붙은 카드의 찜 여부를 한 번에 묻는다(/api/wish/external?keys=). 비로그인은 묻지 않는다
export default function MoreResults({ lang, guest, rate, viewerCurrency, more, seen }: {
  lang: Lang; guest: boolean; rate: number; viewerCurrency: Currency; more: MercariMore; seen: string[];
}) {
  const [items, setItems] = useState<ExternalCardItem[]>([]);
  const [wished, setWished] = useState<Set<string>>(new Set());
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
      const have = new Set([...seen, ...items.map((i) => i.sourceId)]);
      const fresh = j.items.filter((i) => !have.has(i.sourceId));
      setItems((prev) => [...prev, ...fresh]);
      setNext(j.next);
      setState("idle");
      if (!guest && fresh.length) {
        // 찜 여부 — 실패해도 빈 하트로 둔다(누르면 저장되고, 이미 찜이면 서버가 성공으로 본다)
        fetch(`/api/wish/external?keys=${encodeURIComponent(fresh.slice(0, 100).map((i) => wishKey(i.source, i.sourceId)).join(","))}`)
          .then((r) => (r.ok ? r.json() : { keys: [] }))
          .then((w: { keys: string[] }) => { if (w.keys.length) setWished((prev) => new Set([...prev, ...w.keys])); })
          .catch(() => {});
      }
    } catch {
      setState("fail");
    }
  }

  return (
    <>
      {items.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:mt-7 md:grid-cols-4 md:gap-x-5 md:gap-y-7 lg:grid-cols-5">
          {items.map((it) => {
            const k = wishKey(it.source, it.sourceId);
            // key 에 찜 여부를 넣어 조회가 늦게 끝나면 하트를 새 값으로 다시 그린다
            return <ExternalItemCard key={`${k}-${wished.has(k)}`} item={it} wish={{ wished: wished.has(k), guest }} rate={rate} viewerCurrency={viewerCurrency} lang={lang} />;
          })}
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