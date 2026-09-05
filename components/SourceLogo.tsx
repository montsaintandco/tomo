import type { MarketSource } from "@/lib/market/types";
import { t, type Lang } from "@/lib/i18n";

// 출처 로고 — 사조처럼 글자 대신 마켓 아이콘(public/logos, 각 사이트 파비콘 원본). 이름은 alt/title로
export default function SourceLogo({ source, lang, size = 18, className = "" }: {
  source: MarketSource; lang: Lang; size?: number; className?: string;
}) {
  const name = t(lang, `source.${source}`);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/logos/${source}.png`} alt={name} title={name} width={size} height={size} className={`rounded-[4px] ${className}`} />;
}
