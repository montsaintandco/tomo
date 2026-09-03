import Link from "next/link";
import { Wordmark } from "@/components/Brand";

// 회사/법적 정보 자리 — 값은 사용자가 제공할 때까지 "준비 중". 날조 금지
export default function SiteFooter() {
  return (
    <footer className="mt-10 rounded-card bg-tomo-ivory px-4 py-5 text-[12px] leading-relaxed text-ink-soft">
      <Wordmark className="text-lg" />
      <p className="mt-2">한국과 일본을 잇는 중고거래 · 韓国と日本をつなぐフリマ</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-bold text-ink">사업자 정보</dt><dd>준비 중</dd>
        <dt className="font-bold text-ink">고객센터</dt><dd><Link href="/chat" className="underline">채팅으로 문의</Link></dd>
      </dl>
      <p className="mt-3 text-[11px] text-ink-faint">이용약관 · 개인정보처리방침 — 준비 중</p>
    </footer>
  );
}
