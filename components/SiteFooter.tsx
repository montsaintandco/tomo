"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark, TomoSymbol } from "@/components/Brand";

// 전역 푸터 — 모바일은 컴팩트, 데스크톱은 브랜드 밴드 + 메뉴. 채팅방(h-dvh 고정)과 인증 화면에서는 숨김
// 회사/법적 정보 값은 사용자가 제공할 때까지 "준비 중". 날조 금지
export default function SiteFooter() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding") || /^\/chat\/./.test(path)) return null;

  return (
    <footer className="mt-12 border-t border-tomo-navy/5 bg-tomo-ivory text-ink-soft">
      {/* 브랜드 밴드 — 디자인 테제를 브랜드 보이스로 (데스크톱) */}
      <div className="hidden border-b border-tomo-navy/5 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-8">
          <p className="text-[22px] font-extrabold text-tomo-navy">두 말풍선이 만나면, 하트가 돼요</p>
          <TomoSymbol className="h-16 w-24 shrink-0" />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:items-start md:justify-between md:gap-8 md:px-6 md:py-10">
        <div>
          <Wordmark className="text-lg md:text-xl" />
          <p className="mt-2 text-[12px] md:text-sm">한국과 일본을 잇는 중고거래 · 韓国と日本をつなぐフリマ</p>
          <p className="mt-3 hidden max-w-md text-xs leading-relaxed md:block">
            모든 거래는 에스크로 결제로 보호되고, 국제 거래는 나리타·서울 센터 검수를 거쳐
            배송됩니다. 채팅은 한국어·일본어 자동번역으로 이어집니다.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] md:text-xs">
            <dt className="font-bold text-ink">사업자 정보</dt><dd>준비 중</dd>
            <dt className="font-bold text-ink">고객센터</dt><dd><Link href="/chat" className="underline hover:text-ink">채팅으로 문의</Link></dd>
          </dl>
          <p className="mt-2 text-[11px]">이용약관 · 개인정보처리방침 — 준비 중</p>
        </div>
        <nav aria-label="푸터 메뉴" className="hidden gap-12 text-sm md:flex">
          <div>
            <p className="mb-2 text-xs font-bold text-ink">거래</p>
            <ul className="flex flex-col gap-1.5">
              <li><Link className="hover:text-ink" href="/">홈</Link></li>
              <li><Link className="hover:text-ink" href="/?tab=travel">여행 직거래</Link></li>
              <li><Link className="hover:text-ink" href="/global">해외직구·구매대행</Link></li>
              <li><Link className="hover:text-ink" href="/sell">판매하기</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-ink">내 활동</p>
            <ul className="flex flex-col gap-1.5">
              <li><Link className="hover:text-ink" href="/chat">채팅</Link></li>
              <li><Link className="hover:text-ink" href="/mypage">마이페이지</Link></li>
              <li><Link className="hover:text-ink" href="/profile/me">내 프로필</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-tomo-navy/5">
        <p className="mx-auto max-w-6xl px-4 py-3 text-[11px] md:px-6 md:py-4 md:text-xs">© 2026 TOMO · とも</p>
      </div>
    </footer>
  );
}
