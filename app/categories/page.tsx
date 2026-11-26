import Link from "next/link";
import { pageMeta, langUrl } from "@/lib/seo";
import { jsonLd } from "@/lib/json-ld";
import { getRequestLang } from "@/lib/locale";
import { t, otherCountry } from "@/lib/i18n";
import { getThemes } from "@/lib/market/themes";
import { createServerSupabase } from "@/lib/supabase/server";
import { heroImage } from "@/lib/hero-image";
import { getCategoryCandidates } from "@/lib/home/data";
import { pickPhotos } from "@/lib/home/assemble";
import { CATEGORIES, name, catSearchHref } from "@/lib/categories";

export async function generateMetadata() {
  return pageMeta("/categories", "categories", await getRequestLang(), { n: CATEGORIES.length });
}

// 전체 카테고리 — lib/categories.ts 대분류 전부 + 각 세부 분류 링크.
// 대분류를 누르면 /categories/<slug>(세부 분류·미리보기), 세부 분류를 누르면 바로 검색(/global?cat=). 사진은 대표 사진 또는 상대국 마켓 그 카테고리 앞쪽 상품.
// 토모 상품은 있을 때만 「토모 상품 N개」 작은 링크(빈 국내 목록으로 보내지 않는다, 04T10).
export default async function CategoriesPage() {
  const lang = await getRequestLang();
  const country = lang === "ja" ? "JP" : "KR";
  const other = otherCountry(country);
  const supabase = await createServerSupabase();
  // 토모 상품 수 — 대분류마다 세지 않고 한 번에 읽어 센다(판매중 최대 2000건)
  const localCounts = supabase.from("listings").select("category").eq("status", "active").limit(2000)
    .then((r) => {
      const m = new Map<string, number>();
      for (const row of (r.data ?? []) as { category: string }[]) m.set(row.category, (m.get(row.category) ?? 0) + 1);
      return m;
    }, () => new Map<string, number>());
  const [themes, candidates, counts] = await Promise.all([
    getThemes(other).catch(() => []),
    getCategoryCandidates(country, CATEGORIES),
    localCounts,
  ]);
  const photos = pickPhotos(candidates, new Set());
  const subTotal = CATEGORIES.reduce((n, c) => n + c.subs.length, 0);
  const etc = counts.get("etc") ?? 0;
  // 대분류 목록 구조화 데이터 — 화면 목록과 같은 순서·이름·주소
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: t(lang, "home.categories"),
    itemListElement: CATEGORIES.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: name(lang, c), url: langUrl(`/categories/${c.slug}`, lang) })),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{t(lang, "home.categories")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t(lang, "cats.sub", { market: t(lang, `market.${other}`) })}</p>
      <p className="mt-1 text-[12px] text-ink-faint">{t(lang, "cats.count", { n: CATEGORIES.length, m: subTotal })}</p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {CATEGORIES.map((c, i) => {
          const label = name(lang, c);
          const photo = heroImage(c.hero ?? c.slug) ?? photos[i];
          const n = counts.get(c.slug) ?? 0;
          return (
            <li key={c.slug} className="flex flex-col gap-2.5 rounded-card border border-tomo-navy/10 bg-white p-3">
              <Link href={`/categories/${c.slug}`} className="press group flex items-center gap-3">
                <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-tomo-navy/5">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 외부 마켓 썸네일·우리 정적 사진
                    <img src={photo} alt="" loading={i < 6 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover transition-transform duration-200 ease-out fine:group-hover:scale-[1.04]" />
                  ) : (
                    <span aria-hidden className="flex h-full w-full items-center justify-center text-[20px] font-extrabold text-tomo-navy">{label.slice(0, 1)}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-extrabold text-ink">{label}</span>
                  <span className="block text-[12px] text-ink-soft">{t(lang, "cats.seeAll")} ›</span>
                </span>
              </Link>
              <ul className="flex flex-wrap gap-1.5">
                {c.subs.map((sub) => (
                  <li key={sub.slug}>
                    <Link href={catSearchHref(c, sub)} className="press block rounded-full bg-tomo-navy/5 px-2.5 py-1.5 text-[12px] font-bold text-tomo-navy hover:bg-tomo-navy/10">
                      {name(lang, sub)}
                    </Link>
                  </li>
                ))}
              </ul>
              {n > 0 && (
                <Link href={`/?cat=${c.slug}`} className="press -my-1 self-start py-1 text-[12px] font-bold text-tomo-navy underline underline-offset-2">
                  {t(lang, "cats.local", { n })}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {etc > 0 && (
        <Link href="/?cat=etc" className="press mt-6 inline-block py-2 text-[13px] font-bold text-tomo-navy underline underline-offset-2">
          {t(lang, "cats.etc")} · {t(lang, "cats.local", { n: etc })}
        </Link>
      )}

      {themes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[17px] font-extrabold text-ink">{t(lang, "cats.themes")}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {themes.map((th) => (
              <li key={th.key}>
                <Link href={`/global?q=${encodeURIComponent(th.term)}`} className="press block rounded-full bg-tomo-navy/5 px-3.5 py-2.5 text-[13px] font-bold text-tomo-navy hover:bg-tomo-navy/10">
                  {lang === "ja" ? th.labelJa : th.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
