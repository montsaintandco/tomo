// 가격 두 줄 — 큰 줄 보는 사람 통화(700, 숫자 정렬), 작은 줄 원래 통화. 계산은 lib/price-display 만 한다.
// 화면 언어의 기본 통화와 큰 줄 통화가 다르면(로그인 사용자) 통화 코드를 작게 붙인다. 통화 규칙 자체는 안 바꾼다.
import type { ReactNode } from "react";
import type { Currency } from "@/lib/currency";
import { priceParts } from "@/lib/price-display";
import { t, type Lang } from "@/lib/i18n";

const MAIN = { sm: "text-[15px]", md: "text-base", lg: "text-[22px]" } as const;

export default function Price({ amount, currency, viewerCurrency, rate, lang, label, extra, fallback, size = "sm", inline = false, dim = false, fixed = false, className = "" }: {
  amount: number; currency: Currency; viewerCurrency: Currency; rate: number; lang: Lang;
  /** 작은 줄 앞 라벨 — 경매 「현재가」 */
  label?: string | null;
  /** 작은 줄 뒤에 「 · 」로 붙는 것 — 「배송비 포함」·찜 수 */
  extra?: ReactNode;
  /** 금액이 0 이하일 때 큰 줄 글(예: 나눔). 없으면 「가격 확인 필요」 */
  fallback?: string;
  size?: keyof typeof MAIN;
  /** 큰 줄과 작은 줄을 한 줄에 */
  inline?: boolean;
  /** 거래완료 등 — 큰 줄을 약하게 */
  dim?: boolean;
  /** 작은 줄이 비어도 자리를 잡는다 — 카드 높이 고정 */
  fixed?: boolean;
  className?: string;
}) {
  const p = priceParts({ amount, currency, viewerCurrency, rate, lang, label });
  const main = p?.main ?? fallback ?? t(lang, "price.check");
  const subText = p?.sub ?? (p ? null : label ?? null);
  const hasSub = !!subText || !!extra;
  return (
    <span className={`tnum ${inline ? "flex flex-wrap items-baseline gap-x-1.5" : "flex min-w-0 flex-col"} ${className}`}>
      <span className={`${MAIN[size]} font-extrabold leading-snug ${dim ? "text-ink-soft" : "text-ink"}`}>
        {main}
        {p?.tag && (
          <span className="ml-1 align-middle text-[11px] font-bold text-ink-soft" title={t(lang, "price.currencyNote", { cur: p.tag })}>{p.tag}</span>
        )}
      </span>
      {(hasSub || fixed) && (
        <span className={`truncate text-[12px] leading-snug text-ink-soft ${inline ? "" : "min-h-[1.125rem]"}`}>
          {subText}
          {subText && extra ? " · " : null}
          {extra}
        </span>
      )}
    </span>
  );
}
