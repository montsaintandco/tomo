import type { MetadataRoute } from "next";

// PWA — 홈 화면에 추가하면 주소창 없는 standalone 앱. 그때만 하단 탭바가 나온다 (tailwind `standalone:` 변형)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TOMO — 한국·일본 중고거래",
    short_name: "TOMO",
    description: "한국과 일본을 잇는 중고마켓. 韓国と日本をつなぐフリマ。",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF9F4",
    theme_color: "#FFFFFF",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
