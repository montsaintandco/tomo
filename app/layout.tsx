import type { Metadata, Viewport } from "next";
import { websiteJsonLd, OG_IMAGE } from "@/lib/seo";
import { jsonLd } from "@/lib/json-ld";
import "./globals.css";
import { Noto_Sans_KR, Noto_Sans_JP } from "next/font/google";

// 서체: Noto Sans KR/JP(가변) 셀프호스팅 — html lang으로 분기. 한글은 KR, 일본어는 JP(가나·한자 자형이 맞는 쪽)
const notoKR = Noto_Sans_KR({ subsets: ["latin"], variable: "--font-kr", display: "swap" });
const notoJP = Noto_Sans_JP({ subsets: ["latin"], variable: "--font-jp", display: "swap" });
import BottomNav from "@/components/BottomNav";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SupportLauncher from "@/components/SupportLauncher";
import { aiEnabled } from "@/lib/support-ai.server";
import { company, bizLookupUrl, companyComplete } from "@/lib/company";
import { SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getRequestLang } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { cookies } from "next/headers";
import { hasAuthCookie } from "@/components/shell/session";
import InAppNotice from "@/components/shell/InAppNotice";
import { preconnect } from "react-dom";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "TOMO — 한국·일본 중고거래 · 韓国と日本のフリマ", template: "%s | TOMO" },
  description: "메루카리·야후 플리마 상품 구매대행부터 직거래까지. 한국과 일본을 잇는 중고마켓, 토모. / メルカリ・Yahoo!フリマ購入代行から直接取引まで。韓国と日本をつなぐフリマ、トモ。",
  openGraph: {
    title: "TOMO — 한국·일본 중고거래 · 韓国と日本のフリマ",
    description: "한국과 일본을 잇는 중고마켓 · 韓国と日本をつなぐフリマ",
    type: "website",
    siteName: "TOMO",
    images: [OG_IMAGE], // 페이지가 openGraph 를 안 정해도 공유 카드에 사진이 나오게
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE.url] },
  // 검색엔진 소유 확인 — 구글은 Search Console HTML 태그, 네이버는 서치어드바이저 태그(값을 Vercel env에 넣으면 출력)
  verification: {
    google: ["vMO5xOzy6MJQOfiOhntsK_EC-NdjUNjUHcLOBCmVDFo", "a9L8hWLQEvBizz8RhjaBd-iHqFpGnoug6eS10E3-Kuw"], // 옛 tomo-delta 속성 + tomo.airship.click(예비, DNS 로도 확인됨)
    other: { "naver-site-verification": "297445413c4670614a6a0b86e0560c1083305fad" }, // tomo.airship.click 사이트(2026-11-26 등록)
  },
  // PWA — 홈 화면에 추가하면 standalone 앱 (app/manifest.ts)
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "TOMO", statusBarStyle: "default" },
};

// viewportFit cover — 설치된 앱에서 노치·홈 인디케이터 안전영역까지 그린다
export const viewport: Viewport = { themeColor: "#FFFFFF", viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 뷰어 언어가 문서 언어다 — 스크린리더 발음·폰트 셰이핑·번역 방향의 기준
  const lang = await getRequestLang();
  // 홈 히어로·캐러셀 썸네일은 외부 마켓 CDN — 모바일 LCP를 끄는 첫 이미지의 DNS·TLS를 HTML 단계에서 미리 연다
  preconnect("https://static.mercdn.net");
  preconnect("https://auc-pctr.c.yimg.jp");
  // 레이아웃은 DB를 기다리지 않는다(01#8). 로그인 여부는 세션 쿠키 유무로만 추정하고,
  // 안읽은 채팅·장바구니·알림 수는 화면이 뜬 뒤 /api/me/summary 로 받는다(components/shell/HeaderCounts).
  const loggedIn = hasAuthCookie((await cookies()).getAll().map((c) => c.name));
  return (
    <html lang={lang} className={`${notoKR.variable} ${notoJP.variable}`}>
      <body className="flex min-h-dvh flex-col bg-white text-ink standalone:pb-24 md:pb-0">{/* 세로 플렉스 + 푸터 mt-auto: 짧은 페이지에서도 푸터가 바닥에 */}
        {/* impeccable direction contract · v3 정제된 마켓 (2026-09-05): 카와이 브랜드 시그니처 폐기
        THESIS: 사진과 가격이 주인공, 인터페이스는 물러선다 — 흰 바탕·중립 회색·단일 액센트(딥 블루)·텍스트 워드마크·8px. Apple·메루카리급 절제.
        (아래 v2 서술 중 브랜드 색·하트·써라운드·말풍선·Pretendard 항목은 폐기됨. 나라는 KR/JP 텍스트 칩으로만.)
        서체(2026-09-05): Noto Sans KR/JP 가변, html lang 분기. 굵기 400/600/700 세 단, 800 없음. 한글 keep-all. 헤드라인 자간 -0.015em.
        홈 히어로: 검색이 히어로 — 큰 검색/URL 폼 + 인기 검색어 + 테마 타일 4장. 신뢰 스트립은 홈에서 제거.
        홈은 한쪽 매장이 아니라 다리: 어느 나라에서 열어도 "사기(상대국 인기)"와 "팔기(상대국이 찾는 것)" 양면이 내 언어·내 통화로 보인다.
        OWN-WORLD: 흰 페이지 + 네이비 잉크 스케일. 아이보리는 신뢰 스트립·푸터·검색 입력의 틴트로만.
        블루/핑크는 국가 칩·채팅 말풍선·KR/JP 토글 전용, 브리지 그라데이션은 여행 직거래 뱃지 하나. 코랄딥은 단일 CTA·FAB.
        카드 12px, 썸네일 10px, 풀라운드 필, press 0.98, 네이비 틴트 섀도우. Pretendard 램프 11–17px, 써라운드는 워드마크만.
        STORY: 신뢰 스트립 → 상대국 인기(사기) → 국내 그리드 → 상대국이 찾는 것(팔기) → 여행 직거래 → 나머지 인기 → 푸터.
        검색·탭 진입은 밀집 리스트. 유일 상시 모션은 워드마크 하트비트.
        FINISH: DESIGN.md v2가 기록, 디텍터 클린, 크리틱으로 추적 */}
        <a href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-tomo-navy focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">
          {t(lang, "skip.main")}
        </a>
        <SiteHeader lang={lang} loggedIn={loggedIn} />
        <InAppNotice lang={lang} />
        <div id="main">{children}</div>
        <SiteFooter lang={lang} company={{ name: company.name, ceo: company.ceo, bizNo: company.bizNo, mailOrderNo: company.mailOrderNo, address: company.address, phone: company.phone, email: company.email, hours: company.hours, hosting: company.hosting, bizLookupUrl }} />
        <BottomNav lang={lang} loggedIn={loggedIn} />
        <SupportLauncher lang={lang} loggedIn={loggedIn} ai={aiEnabled()} />
        {/* 조직 구조화 데이터 — 사업자 정보가 채워졌을 때만 (날조 금지) */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd()) }} />
        {companyComplete && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
            "@context": "https://schema.org", "@type": "Organization", name: "TOMO", legalName: company.name, url: SITE_URL, logo: `${SITE_URL}/icon-512.png`,
            address: { "@type": "PostalAddress", streetAddress: company.address, addressCountry: "KR" },
            contactPoint: { "@type": "ContactPoint", contactType: "customer service", email: company.email, ...(company.phone ? { telephone: company.phone } : {}) },
          }) }} />
        )}
        {/* 익명 집계 애널리틱스 — 쿠키 없음, 개인정보처리방침의 "추적 쿠키 미사용"과 충돌 없음 */}
        {process.env.VERCEL && <><Analytics /><SpeedInsights /></>}
      </body>
    </html>
  );
}
