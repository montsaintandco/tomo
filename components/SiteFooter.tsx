"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark, TomoSymbol } from "@/components/Brand";

// 데스크톱 전용 푸터 — 채팅방(h-dvh 고정)과 인증 화면에서는 숨김
export default function SiteFooter() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding") || /^\/chat\/./.test(path)) return null;

  return (
    <footer className="mt-16 hidden border-t border-tomo-navy/5 bg-white md:block">
      {/* 브랜드 밴드 — 디자인 테제를 브랜드 보이스로 */}
      <div className="border-b border-tomo-navy/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-8">
          <p className="font-brand text-2xl text-tomo-navy">두 말풍선이 만나면, 하트가 돼요</p>
          <TomoSymbol className="h-16 w-24 shrink-0" />
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-8 px-6 py-10">
        <div>
          <Wordmark className="text-xl" />
          <p className="mt-2 text-sm text-ink-soft">한국과 일본을 잇는 중고마켓 · 韓国と日本をつなぐフリマ</p>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-ink-soft">
            모든 거래는 에스크로 결제로 보호되고, 국제 거래는 나리타·서울 센터 검수를 거쳐
            배송됩니다. 채팅은 한국어·일본어 자동번역으로 이어집니다.
          </p>
        </div>
        <nav aria-label="푸터 메뉴" className="flex gap-12 text-sm">
          <div>
            <p className="mb-2 text-xs font-bold text-ink">거래</p>
            <ul className="flex flex-col gap-1.5 text-ink-soft">
              <li><Link className="hover:text-ink" href="/">국내 피드</Link></li>
              <li><Link className="hover:text-ink" href="/?tab=travel">여행 직거래</Link></li>
              <li><Link className="hover:text-ink" href="/global">해외직구·구매대행</Link></li>
              <li><Link className="hover:text-ink" href="/sell">판매하기</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-ink">내 활동</p>
            <ul className="flex flex-col gap-1.5 text-ink-soft">
              <li><Link className="hover:text-ink" href="/chat">채팅</Link></li>
              <li><Link className="hover:text-ink" href="/mypage">마이페이지</Link></li>
              <li><Link className="hover:text-ink" href="/profile/me">내 프로필</Link></li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t border-tomo-navy/5">
        <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-ink-soft">© 2026 TOMO · とも</p>
      </div>
    </footer>
  );
}
