"use client";
import { useSearchParams } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

// 토스 리다이렉트 결과 한 줄 (?pay=ok | ?pay=fail&code=). 사용자가 결제창을 닫은 건(USER_CANCEL) 오류가 아니다
export default function PayNotice({ lang }: { lang: Lang }) {
  const sp = useSearchParams();
  const pay = sp.get("pay");
  if (pay === "ok") return <p className="mb-3 rounded-card bg-[#eef2ff] p-3 text-[13px] font-bold text-tomo-coral-deep">{t(lang, "pay.ok")}</p>;
  if (pay !== "fail") return null;
  const code = sp.get("code") ?? "";
  if (code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL") return null;
  return <p role="alert" className="mb-3 rounded-card bg-tomo-rose/10 p-3 text-[13px] font-bold text-tomo-rose">{t(lang, "pay.fail")}{code && <span className="ml-1 font-normal opacity-70">({code})</span>}</p>;
}
