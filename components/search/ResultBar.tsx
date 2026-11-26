import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { formatPrice, type Currency } from "@/lib/currency";
import { quickChips, type QuickChip } from "@/components/search/quick-filters";

type Sort = "rec" | "new" | "price_asc" | "price_desc";
const SORTS: [Sort, "filter.sortRec" | "filter.sortNew" | "filter.sortAsc" | "filter.sortDesc"][] = [
  ["rec", "filter.sortRec"], ["new", "filter.sortNew"], ["price_asc", "filter.sortAsc"], ["price_desc", "filter.sortDesc"],
];

// 검색 결과 위 한 줄: 건수 · 정렬 칩 · 빠른 칩(가격대·상태, 필터 패널과 같은 파라미터) · 걸린 필터 칩(누르면 그 조건만 지움) · 번역 검색어 칩 · 넓혀 찾음 안내.
// 링크만 쓴다(JS 없음). params = 지금 검색의 전체 쿼리(q·source·필터)
export default function ResultBar({ lang, currency, params, count, more, sort, chips, translated, widenedFrom }: {
  lang: Lang;
  currency: Currency;                  // 빠른 가격 칩 기준(뷰어 통화)
  params: URLSearchParams;
  count: number;
  more: boolean;                       // 더 불러올 페이지가 있음 → 「N개 이상」
  sort: Sort;
  chips: { key: string[]; label: string }[]; // key = 지울 쿼리 이름들
  translated: string[];                // 실제로 쓴 번역 검색어
  widenedFrom?: string;
}) {
  const href = (edit: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params);
    edit(p);
    return `/global?${p.toString()}`;
  };
  const chip = "press inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold md:text-[13px]";
  const fmt = (v: number) => formatPrice(v, currency, lang);
  const quickLabel = (q: QuickChip) => q.kind === "cond"
    ? t(lang, q.cond === "new" ? "filter.condNew" : "filter.condUsed")
    : q.min && q.max ? t(lang, "search.quickRange", { a: fmt(q.min), b: fmt(q.max) })
      : q.max ? t(lang, "search.chipPriceMax", { v: fmt(q.max) }) : t(lang, "search.chipPriceMin", { v: fmt(q.min!) });
  return (
    <div className="mb-3 flex flex-col gap-2">
      {widenedFrom && translated.length > 0 && (
        <p className="rounded-card bg-tomo-ivory px-3 py-2 text-[12px] text-ink md:text-[13px]">
          {t(lang, "search.widened", { from: widenedFrom, to: translated.join(" · ") })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="tnum text-[13px] font-extrabold text-ink md:text-sm" aria-live="polite">
          {t(lang, more ? "search.countMore" : "search.count", { n: count.toLocaleString(lang === "ja" ? "ja-JP" : "ko-KR") })}
        </p>
        <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0" aria-label={t(lang, "filter.sort")}>
          {SORTS.map(([s, key]) => (
            <Link key={s} aria-current={sort === s ? "true" : undefined}
              href={href((p) => (s === "rec" ? p.delete("sort") : p.set("sort", s)))}
              className={`${chip} ${sort === s ? "bg-tomo-navy text-white" : "border border-tomo-navy/15 bg-white text-ink-soft hover:text-ink"}`}>
              {t(lang, key)}
            </Link>
          ))}
        </nav>
      </div>
      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:px-0" aria-label={t(lang, "search.quick")}>
        {quickChips(params, currency).map((q, i) => (
          <Link key={i} href={q.href} aria-current={q.active ? "true" : undefined}
            className={`${chip} min-h-9 border ${i === 3 ? "ml-1.5" : ""} ${q.active ? "border-accent bg-accent-tint text-accent-ink" : "border-tomo-navy/15 bg-white text-ink-soft hover:text-ink"}`}>
            {quickLabel(q)}
          </Link>
        ))}
      </nav>
      {(chips.length > 0 || translated.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <Link key={c.label} href={href((p) => c.key.forEach((k) => p.delete(k)))}
              aria-label={t(lang, "search.chipRemove", { label: c.label })}
              className={`${chip} bg-tomo-navy/10 text-ink`}>
              {c.label}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-3 w-3" aria-hidden><path d="m7 7 10 10M17 7 7 17" /></svg>
            </Link>
          ))}
          {translated.map((q) => (
            <Link key={q} title={t(lang, "search.translatedChipHint")} href={href((p) => p.set("q", q))}
              className={`${chip} border border-tomo-navy/15 bg-white text-ink-soft hover:text-ink`}>
              {t(lang, "search.translatedChip", { q })}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}