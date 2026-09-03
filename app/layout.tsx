import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "TOMO — 한국·일본 중고거래",
  description: "메루카리·야후 상품 구매대행부터 직거래까지. 한국과 일본을 잇는 중고마켓, 토모.",
  openGraph: {
    title: "TOMO — 한국·일본 중고거래",
    description: "메루카리·야후 상품 구매대행부터 직거래까지",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#FFFFFF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-white pb-24 text-ink md:pb-0">
        {/* impeccable direction contract · v2: brand-pinned, applied like a mature marketplace
        THESIS: 두 말풍선이 만나면 하트가 된다 — 브랜드(블루/핑크/코랄, 하트-O, 써라운드)는 그대로, 적용은 당근·메루카리급 프로덕트로.
        OWN-WORLD: 흰 페이지 + 네이비 잉크 스케일. 아이보리는 신뢰 스트립·푸터·검색 입력의 틴트로만.
        블루/핑크는 국가 칩·채팅 말풍선 전용, 브리지 그라데이션은 여행 직거래 뱃지 하나. 코랄딥은 단일 CTA·FAB.
        카드 12px, 썸네일 10px, 풀라운드 필, press 0.98, 네이비 틴트 섀도우. Pretendard 램프 11–17px, 써라운드는 워드마크만.
        STORY: 홈은 마켓 허브 — 신뢰 스트립 → 상대국 인기 캐러셀 → 국내 그리드 → 여행 직거래 → 회사 정보 푸터.
        검색·탭 진입은 밀집 리스트. 유일 상시 모션은 워드마크 하트비트.
        FINISH: DESIGN.md v2가 기록, 디텍터 클린, 크리틱으로 추적 */}
        <a href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-tomo-navy focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">
          본문 바로가기
        </a>
        <SiteHeader />
        <div id="main">{children}</div>
        <SiteFooter />
        <BottomNav />
      </body>
    </html>
  );
}
