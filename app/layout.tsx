import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "TOMO — 한일 중고거래",
  description: "한국과 일본을 잇는 중고거래 마켓, 토모",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`bg-tomo-ivory pb-20 font-sans`}>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
