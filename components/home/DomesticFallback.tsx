// 국내 상품이 0개일 때 — 빈 화면 대신 상대국 인기 줄 + 등록 유도 (04T8).
// 가짜·대리 매물은 넣지 않는다(05-roadmap 8절). 인기 줄은 실제 상대국 마켓 상품이고 누르면 구매대행 상세로 간다.
import Link from "next/link";
import type { ViewerOrGuest } from "@/lib/listings";
import { t, otherCountry } from "@/lib/i18n";
import { getHomeRows } from "@/lib/home/rows";
import SectionHeader from "@/components/SectionHeader";
import MarketCarousel from "@/components/MarketCarousel";
import { TomoSymbol } from "@/components/Brand";

export default async function DomesticFallback({ viewer, message }: { viewer: ViewerOrGuest; message: string }) {
  const lang = viewer.language;
  const other = otherCountry(viewer.country);
  const row = (await getHomeRows(viewer.country)).find((s) => s.items.length > 0);
  return (
    <div className="flex flex-col gap-8">
      <Link href="/sell" className="press flex items-center gap-3 rounded-card border border-dashed border-tomo-navy/20 px-4 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tomo-navy/5"><TomoSymbol className="h-5 w-7 opacity-70" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-ink">{message}</span>
          <span className="block text-[12px] text-ink-soft">{t(lang, "hub.ownEmptySub")}</span>
        </span>
        <span className="btn shrink-0 bg-tomo-navy px-3.5 py-2 text-[13px] text-white">{t(lang, "hub.sellCta")}</span>
      </Link>
      {row && (
        <section aria-label={t(lang, "home.fallbackTitle", { market: t(lang, `market.${other}`) })}>
          <SectionHeader lang={lang} title={t(lang, "home.fallbackTitle", { market: t(lang, `market.${other}`) })}
            sub={t(lang, "home.fallbackSub")} href="/global" linkLabel={t(lang, "empty.globalCta")} />
          <MarketCarousel items={row.items} rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} viewer={viewer} />
        </section>
      )}
    </div>
  );
}
