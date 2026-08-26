const LABEL: Record<string, { ko: string; ja: string }> = {
  pending_payment: { ko: "결제 대기", ja: "支払い待ち" },
  paid: { ko: "결제 완료", ja: "支払い完了" },
  shipped: { ko: "발송 완료", ja: "発送完了" },
  shipped_to_center: { ko: "센터로 발송", ja: "センターへ発送" },
  center_received: { ko: "센터 입고", ja: "センター入荷" },
  shipped_international: { ko: "국제 발송", ja: "国際発送" },
  delivered: { ko: "배송 도착", ja: "配達完了" },
  completed: { ko: "거래 완료", ja: "取引完了" },
};

const DOMESTIC = ["pending_payment", "paid", "shipped", "delivered", "completed"];
const CROSS = ["pending_payment", "paid", "shipped_to_center", "center_received",
  "shipped_international", "delivered", "completed"];

export default function EscrowTimeline({
  status, isCrossBorder, lang = "ko",
}: { status: string; isCrossBorder: boolean; lang?: "ko" | "ja" }) {
  if (status === "cancelled" || status === "disputed") {
    return (
      <div className="rounded-card bg-tomo-navy/5 p-3 text-center text-sm font-bold text-ink-soft">
        {status === "cancelled"
          ? (lang === "ja" ? "キャンセルされた取引" : "취소된 거래")
          : (lang === "ja" ? "紛争処理中" : "분쟁 처리 중")}
      </div>
    );
  }
  const steps = isCrossBorder ? CROSS : DOMESTIC;
  const cur = steps.indexOf(status);
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const done = i < cur;
        const active = i === cur;
        return (
          <li key={s} className="flex items-center gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              done ? "bg-tomo-blue text-white"
                : active ? "bg-tomo-coral-deep text-white"
                : "bg-tomo-navy/10 text-ink-faint"}`}>
              {done ? "✓" : i + 1}
            </span>
            <span className={`text-sm ${
              active ? "font-bold text-tomo-navy" : done ? "text-ink-soft" : "text-ink-faint"}`}>
              {LABEL[s][lang]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
