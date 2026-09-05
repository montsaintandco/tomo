import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 굵기 3단: 클래스명은 그대로, 값만 — bold=600(라벨·섹션 제목), extrabold=700(가격·헤드라인·워드마크)
      fontWeight: { semibold: "500", bold: "600", extrabold: "700", black: "700" },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // v3 정제된 마켓 — 클래스명은 v2를 유지하고 값만 바꿨다 (역할: navy=구조/잉크, coral-deep=단일 액센트, rose=오류)
        "tomo-blue": "#E5E7EB",       // (구 한국색) 중립 필
        "tomo-pink": "#E5E7EB",       // (구 일본색) 중립 필
        "tomo-coral": "#1D4ED8",      // 액센트 (장식 하트 자리 → 액센트)
        "tomo-coral-deep": "#1D4ED8", // 단일 액센트: CTA·링크·활성. 흰 글자 5.9:1
        "tomo-ivory": "#F5F5F7",      // 틴트 필드 (검색·신뢰 스트립·푸터)
        "tomo-navy": "#111827",       // 구조·잉크·활성 탭 (near-black)
        "tomo-rose": "#DC2626",       // 오류·파괴적
        ink: "#111827",
        "ink-soft": "#6B7280",
        "ink-faint": "#9CA3AF",
      },
      borderRadius: { card: "8px", thumb: "8px" },
      // 네이비 틴트 섀도우 토큰 — shadow-[var(...)] 임의값은 box-shadow로 생성되지 않음
      boxShadow: {
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
        float: "var(--shadow-float)",
      },
    },
  },
  plugins: [
    // 하이브리드: 브라우저에서 열면 웹사이트 문법(상단 헤더), 홈 화면에 설치하면 앱 문법(하단 탭바)
    plugin(({ addVariant }) => {
      addVariant("standalone", "@media (display-mode: standalone)");
      addVariant("browser", "@media not all and (display-mode: standalone)");
      // hover 모션은 정밀 포인터에서만 (터치의 가짜 hover 차단)
      addVariant("fine", "@media (hover: hover) and (pointer: fine)");
    }),
  ],
};
export default config;
