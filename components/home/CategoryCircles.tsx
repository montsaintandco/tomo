// 원형 카테고리 한 줄 (키라팝 CharacterEntry 방식) — 홈의 카테고리 입구는 이것 하나다.
// 누르면 상대국 마켓 검색으로 바로 간다(국내 상품은 비어 있는 때가 많아 기본 입구로 쓰지 않는다. 04T10).
// 사진: public/hero/<key>.jpg 가 있으면 그것, 없으면 상대국 마켓 검색 앞쪽 상품(홈 카드와 겹치지 않게). 못 구하면 첫 글자 원형.
import Link from "next/link";
import { t, otherCountry, type Lang } from "@/lib/i18n";
import { heroImage } from "@/lib/hero-image";
import { HOME_CATEGORIES, getCategoryCandidates } from "@/lib/home/data";
import { pickPhotos, shownKeys } from "@/lib/home/assemble";
import { getHomeRows } from "@/lib/home/rows";

const CIRCLE = "block aspect-square w-16 overflow-hidden rounded-full bg-tomo-navy/5 md:w-20";
const ITEM = "press flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center md:w-auto";
const LABEL = "line-clamp-1 text-[12px] font-bold text-ink md:text-[13px]";

export default async function CategoryCircles({ country, lang }: { country: "KR" | "JP"; lang: Lang }) {
  const [rows, candidates] = await Promise.all([getHomeRows(country), getCategoryCandidates(country)]);
  const live = pickPhotos(candidates, shownKeys(rows));
  return (
    <CirclesFrame lang={lang} other={otherCountry(country)}>
      {HOME_CATEGORIES.map((c, i) => {
        const label = t(lang, `cat.${c.key}`);
        const photo = heroImage(c.key) ?? live[i];
        return (
          <li key={c.key}>
            <Link href={`/global?q=${encodeURIComponent(label)}`} className={ITEM}>
              <span className={CIRCLE}>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 외부 마켓 썸네일·우리 정적 사진
                  <img src={photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden className="flex h-full w-full items-center justify-center text-[22px] font-extrabold text-tomo-navy">{label.slice(0, 1)}</span>
                )}
              </span>
              <span className={LABEL}>{label}</span>
            </Link>
          </li>
        );
      })}
    </CirclesFrame>
  );
}

function CirclesFrame({ lang, other, children }: { lang: Lang; other: "KR" | "JP"; children: React.ReactNode }) {
  return (
    <nav aria-label={t(lang, "home.catAria", { market: t(lang, `market.${other}`) })}>
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-7 md:gap-4 md:px-0">
        {children}
        <li>
          <Link href="/categories" className={ITEM}>
            <span className={`${CIRCLE} flex items-center justify-center`}>
              <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 text-tomo-navy" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </span>
            <span className={LABEL}>{t(lang, "home.catAll")}</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** 사진을 기다리는 동안 — 같은 크기의 빈 원형(밀림 없음) */
export function CategoryCirclesSkeleton({ lang }: { lang: Lang }) {
  return (
    <div aria-hidden className="-mx-4 flex gap-1 overflow-hidden px-4 md:mx-0 md:grid md:grid-cols-7 md:gap-4 md:px-0">
      {[...HOME_CATEGORIES.map((c) => t(lang, `cat.${c.key}`)), t(lang, "home.catAll")].map((label) => (
        <div key={label} className={ITEM}>
          <span className={`${CIRCLE} skeleton`} />
          <span className={LABEL}>{label}</span>
        </div>
      ))}
    </div>
  );
}
