import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { company } from "@/lib/company";

// 배송·취소·환불 정책 요약 — 토스 심사 항목: 상품 상세에 배송 업체·기간, 반품 주소·방법·기한·비용이 보여야 한다.
// kind: domestic(TOMO 상품 에스크로) / proxy(구매대행) / meetup(여행 직거래). 자세한 조항은 /refund
export default function PolicyNote({ lang, kind }: { lang: Lang; kind: "domestic" | "proxy" | "meetup" }) {
  const rows: [string, string][] = [
    [t(lang, "policy.shipBy"), t(lang, kind === "proxy" ? "policy.shipByProxy" : kind === "meetup" ? "policy.shipByMeetup" : "policy.shipByDomestic")],
    [t(lang, "policy.shipTime"), t(lang, kind === "proxy" ? "policy.shipTimeProxy" : kind === "meetup" ? "policy.shipTimeMeetup" : "policy.shipTimeDomestic")],
    [t(lang, "policy.cancel"), t(lang, kind === "proxy" ? "policy.cancelProxy" : kind === "meetup" ? "policy.cancelMeetup" : "policy.cancelDomestic")],
    [t(lang, "policy.return"), t(lang, "policy.returnHow")],
    [t(lang, "policy.returnAddr"), company.returnAddress ?? t(lang, "policy.returnAddrPending")],
    [t(lang, "policy.returnCost"), t(lang, "policy.returnCostText")],
  ];
  return (
    <section aria-label={t(lang, "policy.title")} className="rounded-card border border-tomo-navy/10 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold text-ink">{t(lang, "policy.title")}</h2>
        <Link href="/refund" className="text-[12px] text-tomo-coral-deep underline underline-offset-2">{t(lang, "policy.more")}</Link>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] leading-relaxed text-ink-soft">
        {rows.map(([k, val]) => <div key={k} className="contents"><dt className="whitespace-nowrap font-bold text-ink">{k}</dt><dd>{val}</dd></div>)}
      </dl>
    </section>
  );
}
