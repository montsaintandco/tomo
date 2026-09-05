"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Brand";

export type NavCounts = { disputes: number; proxy: number; center: number; support: number };

const GROUPS: { label: string; items: { href: string; label: string; count?: keyof NavCounts }[] }[] = [
  { label: "운영", items: [
    { href: "/admin", label: "대시보드" },
    { href: "/admin/disputes", label: "분쟁", count: "disputes" },
    { href: "/admin/transactions", label: "거래" },
    { href: "/admin/proxy", label: "대행 요청", count: "proxy" },
    { href: "/admin/orders", label: "주문" },
    { href: "/admin/center", label: "센터", count: "center" },
    { href: "/admin/support", label: "문의", count: "support" },
  ] },
  { label: "카탈로그", items: [
    { href: "/admin/listings", label: "상품" },
    { href: "/admin/external", label: "외부 상품" },
    { href: "/admin/trending", label: "큐레이션" },
  ] },
  { label: "사람", items: [
    { href: "/admin/users", label: "사용자" },
    { href: "/admin/reviews", label: "후기" },
  ] },
  { label: "설정", items: [
    { href: "/admin/rates", label: "환율" },
  ] },
];

// Linear식 사이드바 — 그룹 라벨·30px 항목·활성 배경·우측 카운트. 모바일은 가로 스크롤 탭
export default function AdminNav({ counts, nickname }: { counts: NavCounts; nickname: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  const item = (href: string, label: string, count?: number, compact = false) => (
    <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-md px-2.5 text-[13px] transition-colors ${compact ? "h-8 shrink-0" : "h-[30px]"} ${
        active(href) ? "bg-[var(--a-active)] font-semibold" : "a-muted hover:bg-[var(--a-hover)] hover:text-[var(--a-text)]"}`}>
      <span className="whitespace-nowrap">{label}</span>
      {!!count && <span className="tnum rounded-md bg-tomo-coral-deep px-1.5 text-[11px] font-semibold text-white">{count}</span>}
    </Link>
  );

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-[var(--a-border)] bg-[#f9fafb] px-3 py-4 md:flex">
        <div className="mb-5 flex items-center justify-between px-1.5">
          <Link href="/admin" className="flex items-center gap-2"><Wordmark className="text-lg" /><span className="a-muted text-[11px] font-semibold">운영</span></Link>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto" aria-label="운영 메뉴">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="a-faint mb-1 px-2.5 text-[11px] font-semibold">{g.label}</p>
              <div className="flex flex-col gap-0.5">{g.items.map((i) => item(i.href, i.label, i.count ? counts[i.count] : undefined))}</div>
            </div>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between border-t border-[var(--a-border)] px-1.5 pt-3 text-[12px]">
          <span className="a-muted truncate">{nickname}</span>
          <Link href="/" className="a-link">사이트 →</Link>
        </div>
      </aside>

      {/* 모바일 탭 스트립 */}
      <div className="sticky top-0 z-20 border-b border-[var(--a-border)] bg-[#f9fafb] md:hidden">
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <Link href="/admin"><Wordmark className="text-base" /></Link>
          <span className="a-muted text-[11px] font-semibold">운영</span>
          <Link href="/" className="a-link ml-auto text-[12px]">사이트 →</Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="운영 메뉴">
          {GROUPS.flatMap((g) => g.items).map((i) => item(i.href, i.label, i.count ? counts[i.count] : undefined, true))}
        </nav>
      </div>
    </>
  );
}
