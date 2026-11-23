// 홈 배너 띠 — 어드민(/admin/banners)에서 켠 배너가 있을 때만. 0건·조회 오류면 아무것도 그리지 않아 홈은 그대로.
// 칸은 3:1 고정(aspect)이라 이미지가 늦게 와도 레이아웃이 밀리지 않는다. 여러 장이면 옆으로 넘겨 본다.
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchHomeBanners } from "@/lib/banners";
import { t, type Lang } from "@/lib/i18n";

export default async function BannerStrip({ country, lang }: { country: "KR" | "JP"; lang: Lang }) {
  const banners = await fetchHomeBanners(await createServerSupabase(), country, lang);
  if (banners.length === 0) return null;
  const one = banners.length === 1;
  return (
    <section aria-label={t(lang, "banner.aria")} className="mt-6">
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:scroll-px-0 md:px-0">
        {banners.map((b, i) => {
          const img = (
            // eslint-disable-next-line @next/next/no-img-element -- 우리 스토리지 공개 URL, 크기 제각각 → 3:1 틀에 맞춰 자른다
            <img src={b.image} alt={b.alt} loading={i === 0 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover" />
          );
          const box = "press block aspect-[3/1] overflow-hidden rounded-card bg-tomo-navy/5";
          return (
            <li key={b.id} className={`shrink-0 snap-start md:w-[calc(50%-6px)] ${one ? "w-full" : "w-[85%]"}`}>
              {b.link?.internal ? (
                <Link href={b.link.href} className={box}>{img}</Link>
              ) : b.link ? (
                <a href={b.link.href} target="_blank" rel="noopener noreferrer" className={box} title={t(lang, "banner.external")}>{img}</a>
              ) : (
                <div className={box}>{img}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
