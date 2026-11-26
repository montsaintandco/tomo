"use client";
import { useSearchParams } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

// 결제 리다이렉트 결과 한 줄 (?pay=ok | ?pay=fail&code=). 결제창에서 돌아오기(취소)는 ?pay 없이 와서 아무것도 안 보인다
export default function PayNotice({ lang }: { lang: Lang }) {
  const sp = useSearchParams();
  const pay = sp.get("pay");
  if (pay === "ok") return <p className="mb-3 rounded-card bg-[#eef2ff] p-3 text-[13px] font-bold text-tomo-coral-deep">{t(lang, "pay.ok")}</p>;
  if (pay !== "fail") return null;
  const code = sp.get("code") ?? "";
  if (code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL") return null;
  if (code === "CHECKING" || code === "UNPAID") return <p role="status" className="mb-3 rounded-card bg-[#eef2ff] p-3 text-[13px] font-bold text-tomo-coral-deep">{t(lang, "pay.checking")}</p>;
  if (["NOT_PENDING", "STALE_SESSION", "AMOUNT_CHANGED", "CANCELLED", "LOST_RACE", "ALREADY_REFUNDED"].includes(code)) return <p role="alert" className="mb-3 rounded-card bg-tomo-rose/10 p-3 text-[13px] font-bold text-tomo-rose">{t(lang, "pay.refunded")}</p>;
  return <p role="alert" className="mb-3 rounded-card bg-tomo-rose/10 p-3 text-[13px] font-bold text-tomo-rose">{t(lang, "pay.fail")}{code && <span className="ml-1 font-normal opacity-70">({code})</span>}</p>;
}
