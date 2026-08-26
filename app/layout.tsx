import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "TOMO — 한국·일본 중고거래",
  description: "메루카리·야후 상품 구매대행부터 직거래까지. 한국과 일본을 잇는 중고마켓, 토모.",
  openGraph: {
    title: "TOMO — 한국·일본 중고거래",
    description: "메루카리·야후 상품 구매대행부터 직거래까지",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#FBF9F4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-tomo-ivory pb-24 text-ink">
        {/* impeccable direction contract · seed: brand-pinned redesign
        THESIS: 두 말풍선이 만나면 하트가 된다. 나라·언어 신호는 전부 말풍선 칩(KR=블루, JP=핑크)이고,
        두 나라가 만나는 순간(여행직거래·대행·번역채팅)에만 블루→핑크 그라데이션과 하트가 등장한다.
        회색 마켓 크롬에 브랜드색을 뿌린 배치를 거부한다.
        OWN-WORLD: 아이보리 종이 + 네이비 잉크 스케일, 토모 블루/핑크 파스텔 필드, 코랄 하트 액션(딥 코랄 CTA),
        Cafe24 써라운드 디스플레이, 꼬리 달린 말풍선 칩, 20px 카드, 스쿼시 프레스, 네이비 틴트 섀도우.
        STORY: 피드를 열면 색만으로 어느 나라 물건인지 읽히고, 크로스보더 기회는 그라데이션이 표시하며,
        행동은 언제나 코랄이 받는다.
        FIRST-VIEWPORT: 하트 O 워드마크 헤더 → 검색 필 → 말풍선 세그먼트 탭 → 그라데이션 대행 배너 → 밀집 리스팅 행.
        FORM: 핀 고정 브랜드(카와이·말풍선·하트)의 전면 재실행. 유일 상시 모션은 워드마크 하트비트.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
        the verdict, DESIGN.md, and every shipping raster carrying its provenance */}
        <a href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-tomo-navy focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">
          본문 바로가기
        </a>
        <div id="main">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
