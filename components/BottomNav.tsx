"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 단순 기하 아이콘 (Lucide 기본값 대신 자체 SVG — 브랜드 라운드감 유지, 1.7/2.1 스트로크 통일)
const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z" /></>,
  chat: <path d="M4 5.5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7.5L8 20v-4.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" /></>,
};

const items = [
  { href: "/", label: "홈", icon: "home" },
  { href: "/global", label: "해외직구", icon: "globe" },
  { href: "/sell", label: "판매", icon: "sell" },
  { href: "/chat", label: "채팅", icon: "chat" },
  { href: "/mypage", label: "마이", icon: "user" },
] as const;

export default function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding")) return null;

  return (
    <nav aria-label="주요 메뉴"
      className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-md border-t border-tomo-navy/5 bg-white/95 backdrop-blur md:hidden">
      <ul className="flex items-end">
        {items.map((i) => {
          const active = i.href === "/" ? path === "/" : path.startsWith(i.href);

          // 중앙 판매 버튼 — 떠 있는 코랄 하트 FAB
          if (i.icon === "sell") {
            return (
              <li key={i.href} className="flex-1">
                <Link href={i.href} aria-current={active ? "page" : undefined}
                  className="press -mt-5 flex flex-col items-center gap-1 pb-2.5 text-[10px] font-bold text-tomo-coral-deep">
                  <span className="flex h-12 w-12 -translate-y-2 items-center justify-center rounded-full bg-tomo-coral-deep shadow-[var(--shadow-float)]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}
                      strokeLinecap="round" className="h-6 w-6" aria-hidden>
                      <path d="M12 5.5v13M5.5 12h13" />
                    </svg>
                  </span>
                  <span className="-mt-1.5">{i.label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href} aria-current={active ? "page" : undefined}
                className={`press flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
                  active ? "text-tomo-navy" : "text-ink-soft hover:text-ink"}`}>
                <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-tomo-blue/30" : "bg-transparent"}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.7}
                    strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
                    {ICONS[i.icon]}
                  </svg>
                </span>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
