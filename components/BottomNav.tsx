"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "홈" },
  { href: "/sell", label: "판매" },
  { href: "/chat", label: "채팅" },
  { href: "/profile/me", label: "마이" },
] as const;

export default function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/login") || path.startsWith("/onboarding")) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 mx-auto flex max-w-md justify-around rounded-t-card border-t bg-white py-3">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href}
            className={`text-sm font-bold ${active ? "text-tomo-navy" : "text-gray-400"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
