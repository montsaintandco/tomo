import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-tomo-ivory pb-24 text-gray-900">
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
