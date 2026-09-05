import { t, type Lang } from "@/lib/i18n";

// 신뢰 3칸 — 사실만 말한다 (수치·후기 없음). 원칙 1: 안전장치를 숨기지 말 것
const PILLARS = [
  {
    key: "escrow",
    icon: <><path d="M12 3.5l6.5 2.7v4.6c0 4.3-2.8 7.6-6.5 9.7-3.7-2.1-6.5-5.4-6.5-9.7V6.2z" /><path d="m9.3 11.6 1.9 1.9 3.5-3.5" /></>,
  },
  {
    key: "center",
    icon: <><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" /><path d="M4 8.5l8 4.5 8-4.5M12 13v7" /></>,
  },
  {
    key: "translate",
    icon: <><path d="M4 6h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 3v-3H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /><path d="M17 9.5h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1v2.5l-3-2.5h-3" /></>,
  },
] as const;

export default function TrustStrip({ lang }: { lang: Lang }) {
  return (
    <section aria-label={t(lang, "trust.aria")}>
    <ul className="grid grid-cols-3 gap-1 rounded-card bg-tomo-ivory px-2 py-3 md:gap-4 md:px-6 md:py-5">
      {PILLARS.map((p) => (
        <li key={p.key} className="flex flex-col items-center gap-1.5 text-center md:flex-row md:gap-3 md:text-left">
          <svg viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 shrink-0 md:h-7 md:w-7" aria-hidden>
            {p.icon}
          </svg>
          <span className="flex flex-col gap-0.5">
            <span className="text-[12px] font-bold leading-tight text-tomo-navy md:text-sm">{t(lang, `trust.${p.key}`)}</span>
            <span className="text-[11px] leading-tight text-ink-soft md:text-xs">{t(lang, `trust.${p.key}Sub`)}</span>
          </span>
        </li>
      ))}
    </ul>
    </section>
  );
}
