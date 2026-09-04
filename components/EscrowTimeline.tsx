import { t, type Lang } from "@/lib/i18n";

const DOMESTIC = ["pending_payment", "paid", "shipped", "delivered", "completed"] as const;
const CROSS = ["pending_payment", "paid", "shipped_to_center", "center_received",
  "shipped_international", "delivered", "completed"] as const;
// 만남 거래: 선결제 → 만나서 수령 확인 → 정산
const MEETUP = ["pending_payment", "paid", "met", "completed"] as const;

// 단계 리스트 — 완료=네이비 체크, 현재=코랄딥(행동이 걸린 자리), 대기=틴트. 파스텔은 나라 색이라 쓰지 않는다
export function StepList({ steps, current, lang }: { steps: readonly string[]; current: number; lang: Lang }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              done ? "bg-tomo-navy text-white"
                : active ? "bg-tomo-coral-deep text-white"
                : "bg-tomo-navy/10 text-ink-soft"}`}>
              {done ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}
                  strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                  <path d="m6 12.5 4 4 8-9" />
                </svg>
              ) : i + 1}
            </span>
            <span className={`text-sm ${active ? "font-bold text-ink" : done ? "text-ink-soft" : "text-ink-faint"}`}>
              {t(lang, `status.${s}` as "status.paid")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function EscrowTimeline({
  status, isCrossBorder, meetup = false, lang = "ko",
}: { status: string; isCrossBorder: boolean; meetup?: boolean; lang?: Lang }) {
  if (status === "cancelled" || status === "disputed") {
    return (
      <div className="rounded-card bg-tomo-navy/5 p-3 text-center text-sm font-bold text-ink-soft">
        {t(lang, status === "cancelled" ? "tx.cancelled" : "tx.disputed")}
      </div>
    );
  }
  const steps: readonly string[] = meetup ? MEETUP : isCrossBorder ? CROSS : DOMESTIC;
  // 만남 거래의 delivered = "만나서 수령" 라벨
  const current = steps.indexOf(meetup && status === "delivered" ? "met" : status);
  return <StepList steps={steps} current={current} lang={lang} />;
}
