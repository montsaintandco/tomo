import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import type { MarketSource } from "@/lib/market/types";

// 품절 상세 구제(에어쉽 EndedRescue 축약) — 상태 한 줄 → 같은 핵심어로 다시 찾기 → 비슷한 상품(children, 스트리밍).
// 알림 버튼은 뺐다(05-roadmap 8절: 예약 실행 기반이 없다)
export default function EndedRescue({ lang, source, query, children }: {
  lang: Lang; source: MarketSource; query: string; children: React.ReactNode;
}) {
  return (
    <section aria-label={t(lang, "detail.endedTitle")} className="rounded-card border border-tomo-navy/10 p-3.5">
      <p className="text-[15px] font-extrabold text-ink">{t(lang, "detail.endedTitle")}</p>
      <p className="mt-0.5 text-[12px] text-ink-soft">{t(lang, "detail.endedBody")}</p>
      {query && (
        <Link href={`/global?q=${encodeURIComponent(query)}&source=${source}`}
          className="btn mt-3 block border border-tomo-navy/15 bg-white py-2.5 text-center text-[13px] text-ink">
          {t(lang, "detail.endedSearch", { q: query })}
        </Link>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}
