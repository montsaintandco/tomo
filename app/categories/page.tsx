import Link from "next/link";
import { pageMeta, langFromSearch } from "@/lib/seo";
import { getRequestLang } from "@/lib/locale";
import { t, otherCountry } from "@/lib/i18n";
import { getThemes } from "@/lib/market/themes";
import { createServerSupabase } from "@/lib/supabase/server";
import { heroImage } from "@/lib/hero-image";
import { HOME_CATEGORIES, getCategoryCandidates } from "@/lib/home/data";
import { pickPhotos } from "@/lib/home/assemble";

export async function generateMetadata(props: { searchParams: Promise<{ lang?: string }> }) {
  return pageMeta("/categories", { title: "카테고리 · カテゴリー", description: "피규어·카메라·패션·K-POP·게임·빈티지 등 카테고리별로 한국·일본 중고 상품을 둘러보세요." }, langFromSearch(await props.searchParams));
}

// 카테고리 — 카드 하나 = 입구 하나(상대국 마켓 검색). 대표 사진은 그 검색의 앞쪽 상품.
// 토모 상품은 있을 때만 「토모 상품 N개」 작은 링크로 붙인다(빈 국내 목록으로 보내지 않는다, 04T10). 「기타」는 토모 상품이 있을 때만.
export default async function CategoriesPage() {
  const lang = await getRequestLang();
  const country = lang === "ja" ? "JP" : "KR";
  const other = otherCountry(country);
  const supabase = await createServerSupabase();
  const count = (k: string) => supabase.from("listings").select("id", { count: "exact", head: true }).eq("status", "active").eq("category", k)
    .then((r) => r.count ?? 0, () => 0);
  const [themes, candidates, counts, etc] = await Promise.all([
    getThemes(other).catch(() => []),
    getCategoryCandidates(country),
    Promise.all(HOME_CATEGORIES.map((c) => count(c.key))),
    count("etc"),
  ]);
  const photos = pickPhotos(candidates, new Set());

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{t(lang, "home.categories")}</h1>
      <p className="mt-2 text-sm text-ink-soft">{t(lang, "cats.sub", { market: t(lang, `market.${other}`) })}</p>

      <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-3 md:gap-x-5 md:gap-y-7">
        {HOME_CATEGORIES.map((c, i) => {
          const label = t(lang, `cat.${c.key}`);
          const photo = heroImage(c.key) ?? photos[i];
          return (
            <li key={c.key} className="flex flex-col gap-1.5">
              <Link href={`/global?q=${encodeURIComponent(label)}`} className="press group flex flex-col gap-2">
                <span className="block aspect-[4/3] overflow-hidden rounded-card bg-tomo-navy/5">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 외부 마켓 썸네일·우리 정적 사진
                    <img src={photo} alt="" loading={i < 2 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover transition-transform duration-200 ease-out fine:group-hover:scale-[1.03]" />
                  ) : (
                    <span aria-hidden className="flex h-full w-full items-center justify-center text-[32px] font-extrabold text-tomo-navy">{label.slice(0, 1)}</span>
                  )}
                </span>
                <span className="text-[15px] font-extrabold text-ink">{label}</span>
              </Link>
              {counts[i] > 0 && (
                <Link href={`/?cat=${c.key}`} className="press -my-2 self-start py-2 text-[12px] font-bold text-tomo-navy underline underline-offset-2">
                  {t(lang, "cats.local", { n: counts[i] })}
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
