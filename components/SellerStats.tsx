import { t, type Lang } from "@/lib/i18n";

export type SellerStatsData = { deals: number; cross_deals: number; response_rate: number | null };

// 당근 응답률 + 메루카리 거래 횟수를 크로스보더 버전으로 — 숫자는 DB 함수(seller_stats)가 계산
export default function SellerStats({ stats, lang, className = "" }: { stats: SellerStatsData | null; lang: Lang; className?: string }) {
  if (!stats) return null;
  const chip = "rounded-full bg-tomo-navy/5 px-2 py-0.5 text-[11px] font-bold text-tomo-navy";
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      <span className={`tnum ${chip}`}>{t(lang, "stats.deals", { n: stats.deals })}</span>
      {stats.cross_deals > 0 && <span className={`tnum ${chip}`}>{t(lang, "stats.cross", { n: stats.cross_deals })}</span>}
      <span className={`tnum ${chip}`}>
        {stats.response_rate == null ? t(lang, "stats.responseNone") : t(lang, "stats.response", { n: stats.response_rate })}
      </span>
    </span>
  );
}
