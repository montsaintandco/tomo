"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import { clearRecentViewed, getRecentViewed, type RecentItem } from "@/lib/home/recent-viewed";
import Price from "@/components/ui/Price";

// 최근 본 상품 줄 — 기록이 없으면 아무것도 그리지 않는다. 브라우저에서만 읽으므로 첫 화면 아래(인기 줄 뒤)에 둬서 밀림이 첫 화면에 안 보이게 한다.
export default function RecentViewed({ lang, rate, viewerCurrency }: { lang: Lang; rate: number; viewerCurrency: Currency }) {
  const [list, setList] = useState<RecentItem[]>([]);
  // localStorage 는 브라우저에서만 있다 — 마운트 뒤 한 번 읽는다(components/search/RecentSearches 와 같은 방식)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setList(getRecentViewed()), []);
  if (list.length === 0) return null;
  return (
    <section className="mt-8" aria-label={t(lang, "home.recent")}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "home.recent")}</h2>
        <button type="button" onClick={() => { clearRecentViewed(); setList([]); }}
          className="press -my-2 min-h-11 px-2 text-[12px] text-ink-soft underline underline-offset-2">{t(lang, "home.recentClear")}</button>
      </div>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
        {list.map((it) => (
          <li key={it.href} className="w-[112px] shrink-0">
            <Link href={it.href} className="press flex flex-col" title={it.title}>
              <span className="block aspect-square overflow-hidden rounded-thumb bg-tomo-navy/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </span>
              <span className="mt-1.5 line-clamp-1 text-[12px] leading-snug text-ink">{it.title}</span>
              <Price amount={it.price} currency={it.currency} viewerCurrency={viewerCurrency} rate={rate} lang={lang} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
