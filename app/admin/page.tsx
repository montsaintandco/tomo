import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import Link from "next/link";
import { redirect } from "next/navigation";

// 운영자 화면은 한국어 고정 (센터 운영 인력 기준). 토큰만 v2
export default async function AdminHome() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) redirect("/");

  const [newProxy, quotedProxy, centerIn, centerOut] = await Promise.all([
    supabase.from("proxy_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase.from("proxy_requests").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "shipped_to_center"),
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "center_received"),
  ]);

  const cards = [
    { href: "/admin/proxy", label: "대행 신청", value: newProxy.count ?? 0, sub: "견적 대기" },
    { href: "/admin/proxy", label: "결제 승인", value: quotedProxy.count ?? 0, sub: "구매 진행 필요" },
    { href: "/admin/center", label: "센터 입고", value: centerIn.count ?? 0, sub: "입고 확인 대기" },
    { href: "/admin/center", label: "국제 발송", value: centerOut.count ?? 0, sub: "발송 대기" },
  ];

  return (
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-3xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-4 text-[17px] font-extrabold leading-tight text-ink md:text-xl">운영</h1>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c, i) => (
          <Link key={i} href={c.href} className="card p-4">
            <p className="text-[12px] text-ink-soft">{c.label}</p>
            <p className={`tnum my-1 text-xl font-extrabold ${c.value > 0 ? "text-tomo-coral-deep" : "text-ink"}`}>{c.value}</p>
            <p className="text-[11px] text-ink-faint">{c.sub}</p>
          </Link>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[["/admin/proxy", "구매대행 관리"], ["/admin/center", "센터 관리"], ["/admin/external", "외부 상품 등록 (당근·중고나라)"]].map(([href, label]) => (
          <Link key={href} href={href} className="card flex items-center justify-between p-3.5 text-sm font-bold text-ink">
            {label}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-faint" aria-hidden><path d="m9 5 7 7-7 7" /></svg>
          </Link>
        ))}
      </div>
    </main>
  );
}
