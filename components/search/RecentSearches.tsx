"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from "@/lib/recent";
import { t, type Lang } from "@/lib/i18n";

// 최근 검색 — 검색하면 기록하고(localStorage), 검색어가 없을 때 칩으로 보인다. 서버는 모른다
export default function RecentSearches({ lang, q, source }: { lang: Lang; q: string; source?: string }) {
  const [list, setList] = useState<string[]>([]);
  // localStorage 는 브라우저에만 있다 — 마운트 뒤에 한 번 읽는다(서버 렌더와 첫 화면은 빈 목록)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setList(q ? addRecentSearch(q) : getRecentSearches()), [q]);
  if (q || list.length === 0) return null;
  const href = (s: string) => `/global?q=${encodeURIComponent(s)}${source ? `&source=${source}` : ""}`;
  return (
    <section className="mb-4" aria-label={t(lang, "search.recent")}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-extrabold text-ink">{t(lang, "search.recent")}</h2>
        <button type="button" onClick={() => { clearRecentSearches(); setList([]); }}
          className="press min-h-11 px-2 text-[12px] text-ink-soft underline underline-offset-2">{t(lang, "search.recentClear")}</button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {list.map((s) => (
          <li key={s} className="flex items-center rounded-full border border-tomo-navy/15 bg-white">
            <Link href={href(s)} className="press py-2 pl-3 pr-1 text-[13px] text-ink">{s}</Link>
            <button type="button" aria-label={t(lang, "search.recentRemove", { q: s })} onClick={() => setList(removeRecentSearch(s))}
              className="press flex h-9 w-9 items-center justify-center text-ink-soft hover:text-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden><path d="m7 7 10 10M17 7 7 17" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}