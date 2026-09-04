import Link from "next/link";
import { getRequestLang } from "@/lib/locale";
import { t, otherCountry } from "@/lib/i18n";
import { CATEGORY_KEYS } from "@/components/CategoryChips";
import { getThemes } from "@/lib/market/themes";

export const metadata = { title: "카테고리 · カテゴリー | TOMO" };

// 카테고리 — 사줘의 "카테고리"에 해당. 카테고리마다 해외직구 검색·국내 상품 두 진입, 아래에 상대국 인기 키워드
const ICON: Record<string, string> = { figure: "🧸", camera: "📷", fashion: "👕", kpop: "🎤", game: "🎮", vintage: "🕰️", etc: "📦" };
const C = {
  ko: { h1: "카테고리", sub: "해외직구는 상대국 마켓에서, 국내는 토모에 올라온 상품에서 찾아요.", global: "해외직구", local: "국내 상품", themes: "지금 인기 키워드" },
  ja: { h1: "カテゴリー", sub: "海外購入は相手国のマーケットから、国内はトモの出品から探せます。", global: "海外購入", local: "国内商品", themes: "いま人気のキーワード" },
} as const;

export default async function CategoriesPage() {
  const lang = await getRequestLang();
  const c = C[lang];
  const themes = await getThemes(otherCountry(lang === "ja" ? "JP" : "KR")).catch(() => []);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <h1 className="text-[22px] font-extrabold text-ink md:text-3xl">{c.h1}</h1>
      <p className="mt-2 text-sm text-ink-soft">{c.sub}</p>

      <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {CATEGORY_KEYS.map((k) => (
          <li key={k} className="card flex flex-col gap-2 p-4">
            <p className="text-[15px] font-extrabold text-ink"><span className="mr-1.5" aria-hidden>{ICON[k]}</span>{t(lang, `cat.${k}`)}</p>
            <div className="flex flex-wrap gap-1.5 text-[12px] font-bold">
              <Link href={`/global?q=${encodeURIComponent(t(lang, `cat.${k}`))}`} className="press rounded-full bg-tomo-navy px-3 py-1.5 text-white">{c.global}</Link>
              <Link href={`/?cat=${k}`} className="press rounded-full bg-tomo-navy/5 px-3 py-1.5 text-tomo-navy">{c.local}</Link>
            </div>
          </li>
        ))}
      </ul>

      {themes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[17px] font-extrabold text-ink">{c.themes}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {themes.map((th) => (
              <li key={th.key}>
                <Link href={`/global?q=${encodeURIComponent(th.term)}`} className="press block rounded-full bg-tomo-navy/5 px-3.5 py-2 text-[13px] font-bold text-tomo-navy hover:bg-tomo-navy/10">
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
