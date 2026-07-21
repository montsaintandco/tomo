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
        "tomo-ivory": "#FBF9F4",
        "tomo-navy": "#0C447C",
      },
      borderRadius: { card: "16px" },
    },
  },
  plugins: [],
};
export default config;
