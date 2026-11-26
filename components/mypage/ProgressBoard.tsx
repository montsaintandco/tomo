// 진행 보드 (키라팝 components/mypage/ProgressBoard 원칙) — 단계 동그라미 + 이음선, 건수가 있는 가장 뒤 단계까지 칠한다.
// 단계 묶기는 counts.ts progressCounts. 결제 전·완료 건은 「할 일」·구매 목록이 맡는다.
import { t, type Lang } from "@/lib/i18n";
import SectionHeader from "@/components/SectionHeader";
import { PROGRESS_STEPS, type ProgressStep } from "@/components/mypage/counts";

export default function ProgressBoard({ counts, lang }: { counts: Record<ProgressStep, number>; lang: Lang }) {
  const total = PROGRESS_STEPS.reduce((a, s) => a + counts[s], 0);
  const reach = PROGRESS_STEPS.reduce((acc, s, i) => (counts[s] > 0 ? i : acc), -1);
  return (
    <section aria-label={t(lang, "my.progress.title")} className="mb-8">
      <SectionHeader lang={lang} title={t(lang, "my.progress.title")} sub={total > 0 ? t(lang, "my.progress.count", { n: total }) : undefined}
        href="/mypage/orders" linkLabel={t(lang, "my.progress.all")} />
      <div className="card px-2 pb-3 pt-4">
        <ol className="flex items-start">
          {PROGRESS_STEPS.map((s, i) => {
            const n = counts[s];
            return (
              <li key={s} className="relative flex flex-1 flex-col items-center gap-1.5">
                {i > 0 && (
                  <span aria-hidden className={`absolute left-[-50%] right-1/2 top-[17px] h-[3px] rounded-full ${i <= reach ? "bg-tomo-coral-deep" : "bg-tomo-navy/10"}`} />
                )}
                <span className={`tnum relative flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-extrabold ${
                  n > 0 ? "bg-tomo-navy text-white" : "border-[1.5px] border-tomo-navy/10 bg-white text-ink-faint"}`}>{n}</span>
                <span className={`text-center text-[12px] leading-tight ${n > 0 ? "font-bold text-ink" : "text-ink-soft"}`}>{t(lang, `my.progress.${s}`)}</span>
              </li>
            );
          })}
        </ol>
        {total === 0 && <p className="mt-3 text-center text-[12px] text-ink-soft">{t(lang, "my.progress.none")}</p>}
      </div>
    </section>
  );
}
