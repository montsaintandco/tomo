import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { pageMeta, langFromSearch } from "@/lib/seo";
import { t, otherCountry, type Lang } from "@/lib/i18n";
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { searchMarkets } from "@/lib/market/search";
import { withTranslatedTitles } from "@/lib/market/translate-items";
import { LIVE_SOURCES, SOURCE_CURRENCY, type MarketSource } from "@/lib/market/types";
import ExternalItemCard, { type ExternalCardItem } from "@/components/ExternalItemCard";
import type { Currency } from "@/lib/currency";
import { CATEGORIES, MERCARI_ROOTS, findMajor, name, catScope, catSearchHref, type MajorCategory } from "@/lib/categories";

export async function generateMetadata(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await props.params;
  const c = findMajor(slug);
  const lang = langFromSearch(await props.searchParams);
  const title = c ? `${c.ko} · ${c.ja}` : "카테고리 · カテゴリー";
  const subs = c ? c.subs.map((x) => x.ko).slice(0, 6).join("·") : "";
  return pageMeta(`/categories/${slug}`, { title, description: c ? `${c.ko}(${subs} 등) 중고 상품을 일본·한국 마켓에서 찾아 구매대행으로 받아보세요.` : undefined }, lang);
}

const PREVIEW = 10;
const PREVIEW_TIMEOUT_MS = 6000;

// 대분류 화면 — 위치 줄 · 세부 분류 칸 · 상대국 마켓 미리보기 · (한국 사용자) 메루카리 전체 카테고리 · 다른 대분류.
// 에어쉽 /category/<slug>(src/routes/category.$slug.tsx)의 틀을 토모 검색(/global?cat=)에 맞게 줄였다. 정렬·가격·더 보기는 검색 화면이 맡는다.
export default async function CategoryPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const major = findMajor(slug);
  if (!major) notFound();
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const lang: Lang = viewer.language;
  const other = otherCountry(viewer.country);
  const sources = LIVE_SOURCES.filter((s) => SOURCE_CURRENCY[s] === (viewer.country === "KR" ? "JPY" : "KRW"));
  const local = await supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active").eq("category", major.slug)
    .then((r) => r.count ?? 0, () => 0);
  const label = name(lang, major);
  const sub = "mt-8 text-[17px] font-extrabold text-ink";
  const pill = "press block rounded-full px-3.5 py-2.5 text-[13px] font-bold";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      <nav aria-label={t(lang, "cats.where")} className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-soft md:text-[13px]">
        <Link href="/" className="press py-1 hover:underline">{t(lang, "cats.home")}</Link>
        <span aria-hidden>›</span>
        <Link href="/categories" className="press py-1 hover:underline">{t(lang, "cats.all")}</Link>
        <span aria-hidden>›</span>
        <span className="font-bold text-ink" aria-current="page">{label}</span>
      </nav>
      <h1 className="mt-2 text-[22px] font-extrabold text-ink md:text-3xl">{label}</h1>
      <p className="mt-1 text-sm text-ink-soft">{t(lang, "cats.sub", { market: t(lang, `market.${other}`) })}</p>

      <h2 className={sub}>{t(lang, "cats.subs")}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <li>
          <Link href={catSearchHref(major)} className="press flex min-h-12 items-center rounded-card bg-tomo-navy px-3 py-2.5 text-[13px] font-bold text-white">
            {t(lang, "cats.allOf", { name: label })}
          </Link>
        </li>
        {major.subs.map((s) => (
          <li key={s.slug}>
            <Link href={catSearchHref(major, s)} className="press flex min-h-12 items-center rounded-card border border-tomo-navy/10 bg-white px-3 py-2.5 text-[13px] font-bold text-ink hover:border-tomo-navy/30">
              {name(lang, s)}
            </Link>
          </li>
        ))}
      </ul>
      {viewer.country === "JP" && <p className="mt-2 text-[12px] text-ink-faint">{t(lang, "cats.krKeyword")}</p>}
      {local > 0 && (
        <Link href={`/?cat=${major.slug}`} className="press mt-3 inline-block py-1 text-[13px] font-bold text-tomo-navy underline underline-offset-2">
          {t(lang, "cats.local", { n: local })}
        </Link>
      )}

      <div className="mt-8 flex items-end justify-between gap-3">
        <h2 className="text-[17px] font-extrabold text-ink">{t(lang, "cats.preview", { market: t(lang, `market.${other}`) })}</h2>
        <Link href={catSearchHref(major)} className="press shrink-0 py-1 text-[13px] font-bold text-tomo-navy underline underline-offset-2">{t(lang, "cats.seeAll")} ›</Link>
      </div>
      <Suspense fallback={<PreviewSkeleton />}>
        <Preview major={major} sources={sources} lang={lang} currency={viewer.currency} rate={viewer.rate} />
      </Suspense>

      {viewer.country === "KR" && <MercariTree lang={lang} major={major} />}

      <h2 className={sub}>{t(lang, "cats.others")}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.filter((c) => c.slug !== major.slug).map((c) => (
          <li key={c.slug}><Link href={`/categories/${c.slug}`} className={`${pill} bg-tomo-navy/5 text-tomo-navy hover:bg-tomo-navy/10`}>{name(lang, c)}</Link></li>
        ))}
      </ul>
    </main>
  );
}

const GRID = "mt-3 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 md:gap-x-5 lg:grid-cols-5";

async function Preview({ major, sources, lang, currency, rate }: { major: MajorCategory; sources: MarketSource[]; lang: Lang; currency: Currency; rate: number }) {
  const r = await Promise.race([
    searchMarkets("", sources, {}, currency, rate, catScope({ kind: "tomo", major })).then((x) => x.items).catch(() => []),
    new Promise<[]>((res) => setTimeout(() => res([]), PREVIEW_TIMEOUT_MS)),
  ]);
  const items = (await withTranslatedTitles(r.slice(0, PREVIEW), lang).catch(() => r.slice(0, PREVIEW))) as ExternalCardItem[];
  if (items.length === 0) return <p className="mt-3 rounded-card bg-tomo-ivory px-4 py-6 text-center text-[13px] text-ink-soft">{t(lang, "cats.previewEmpty")}</p>;
  return (
    <div className={GRID}>
      {items.map((it) => <ExternalItemCard key={`${it.source}-${it.sourceId}`} item={it} rate={rate} viewerCurrency={currency} lang={lang} />)}
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div aria-hidden className={GRID}>
      {Array.from({ length: PREVIEW }, (_, i) => <div key={i} className="skeleton aspect-square rounded-card" />)}
    </div>
  );
}

// 메루카리 대분류 전부 — 이 대분류와 가까운 칸(roots)을 먼저, 나머지는 뒤에. 누르면 그 메루카리 카테고리로 검색(?cat=m<번호>)
function MercariTree({ lang, major }: { lang: Lang; major: MajorCategory }) {
  const near = MERCARI_ROOTS.filter((r) => major.roots.includes(r.id));
  const rest = MERCARI_ROOTS.filter((r) => !major.roots.includes(r.id));
  const link = (r: (typeof MERCARI_ROOTS)[number], on: boolean) => (
    <li key={r.id}>
      <Link href={`/global?cat=m${r.id}`} className={`press block rounded-full px-3 py-2 text-[12px] font-bold md:text-[13px] ${on ? "bg-tomo-navy text-white" : "border border-tomo-navy/15 bg-white text-ink-soft hover:text-ink"}`}>
        {name(lang, r)}
      </Link>
    </li>
  );
  return (
    <section className="mt-10 rounded-card bg-tomo-ivory p-4">
      <h2 className="text-[17px] font-extrabold text-ink">{t(lang, "cats.mercariTree")}</h2>
      <p className="mt-3 text-[12px] font-bold text-ink-soft">{t(lang, "cats.mercariNear")}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">{near.map((r) => link(r, true))}</ul>
      <p className="mt-4 text-[12px] font-bold text-ink-soft">{t(lang, "cats.mercariRest")}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">{rest.map((r) => link(r, false))}</ul>
    </section>
  );
}
