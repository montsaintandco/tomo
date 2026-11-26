import { t, type Lang } from "@/lib/i18n";
import type { RuleCode } from "@/lib/item-insight";

// 상품 주의 체크 — 규칙 판정(lib/item-insight)만 보여 준다. 서버에서 그린다(AI 없음). 경고가 없으면 아무것도 안 그린다
export default function ItemInsight({ lang, codes, sellerCancels = 0, className = "" }: {
  lang: Lang; codes: RuleCode[]; sellerCancels?: number; className?: string;
}) {
  const lines = [
    ...codes.map((c) => t(lang, `detail.rule.${c}`)),
    ...(sellerCancels > 0 ? [t(lang, "detail.sellerCancels", { n: sellerCancels })] : []),
  ];
  if (lines.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-1.5 ${className}`}>
      {lines.map((s) => (
        <li key={s} role="note" className="flex items-start gap-2 rounded-card bg-tomo-ivory px-3 py-2 text-[13px] leading-snug text-ink">
          <span aria-hidden className="mt-px shrink-0 font-extrabold text-tomo-coral-deep">!</span>
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );
}
