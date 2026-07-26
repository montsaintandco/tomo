import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import Link from "next/link";
import { redirect } from "next/navigation";

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
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-tomo-navy">운영 · 管理</h1>
      <div className="mb-5 grid grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <Link key={i} href={c.href} className="rounded-card border bg-white p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="my-1 text-2xl font-bold text-tomo-navy">{c.value}</p>
            <p className="text-[10px] text-gray-400">{c.sub}</p>
          </Link>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Link href="/admin/proxy" className="rounded-card border bg-white p-3 text-sm font-bold">구매대행 관리 →</Link>
        <Link href="/admin/center" className="rounded-card border bg-white p-3 text-sm font-bold">센터 관리 →</Link>
        <Link href="/admin/external" className="rounded-card border bg-white p-3 text-sm font-bold">외부 상품 등록 (당근·중고나라) →</Link>
      </div>
    </main>
  );
}
