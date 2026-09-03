import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        "tomo-blue": "#9CC5EC",
        "tomo-pink": "#F2AFAF",
        "tomo-coral": "#E2807F",
        // 흰 글자를 얹는 코랄 — 파스텔 코랄은 AA 대비가 안 나옴
        "tomo-coral-deep": "#C14E4C",
        "tomo-ivory": "#FBF9F4",
        "tomo-navy": "#0C447C",
        // JP 텍스트용 딥 로즈 (핑크 틴트 배경 위 4.5:1 확보)
        "tomo-rose": "#A34543",
        // 네이비 틴트 잉크 스케일 — 무채색 회색 대신
        ink: "#26333F",
        "ink-soft": "#5C6B77",
        "ink-faint": "#93A0AB",
      },
      borderRadius: { card: "12px", thumb: "10px" },
    },
  },
  plugins: [],
};
export default config;
