import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";

export const CATEGORY_KEYS = ["figure", "camera", "fashion", "kpop", "game", "vintage", "etc"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export const isCategory = (v: unknown): v is CategoryKey => CATEGORY_KEYS.includes(v as CategoryKey);

// 카테고리 칩 행 (당근·메루카리 홈의 카테고리 진입). active면 그 칩이 네이비 필
export default function CategoryChips({ lang, active, q }: { lang: Lang; active?: CategoryKey; q?: string }) {
  const href = (cat?: CategoryKey) => {
    const p = new URLSearchParams();
    if (cat) p.set("cat", cat);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const chip = (on: boolean) =>
    `press shrink-0 snap-start rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors ${
      on ? "bg-tomo-navy text-white shadow-soft" : "bg-tomo-navy/5 text-tomo-navy hover:bg-tomo-navy/10"}`;
  return (
    <nav aria-label={t(lang, "home.categories")}
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:flex-wrap md:px-0">
      {active && <Link href={href()} className={chip(false)}>{t(lang, "cat.all")}</Link>}
      {CATEGORY_KEYS.map((c) => (
        <Link key={c} href={href(c)} aria-current={active === c ? "page" : undefined} className={chip(active === c)}>
          {t(lang, `cat.${c}`)}
        </Link>
      ))}
    </nav>
  );
}
