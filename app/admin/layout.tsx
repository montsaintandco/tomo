import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import AdminNav from "@/components/admin/AdminNav";
import { redirect } from "next/navigation";

export const metadata = { robots: { index: false }, title: "운영 | TOMO" };

// 어드민 셸 — 권한 가드 한 곳 + Linear식 사이드바. 사용자 앱 크롬(GNB·푸터·탭바)은 /admin에서 숨긴다
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) redirect("/");

  // 환불·출금 표(0025·0026)가 아직 없으면 오류 → count null → 0
  const [disputes, proxy, center, support, me, refunds, payouts, cancelReq] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "disputed"),
    supabase.from("proxy_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "approved", "paid", "purchasing", "center_received"]),
    supabase.from("transactions").select("id", { count: "exact", head: true }).in("status", ["shipped_to_center", "center_received"]),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("profiles").select("nickname").eq("id", viewer.id).single(),
    supabase.from("refunds").select("id", { count: "exact", head: true }).in("status", ["pending", "failed"]),
    supabase.from("payouts").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase.from("proxy_requests").select("id", { count: "exact", head: true }).eq("status", "paid").not("cancel_requested_at", "is", null),
  ]);

  return (
    <div className="admin md:flex">
      <AdminNav nickname={me.data?.nickname ?? "운영자"}
        counts={{ disputes: disputes.count ?? 0, proxy: (proxy.count ?? 0) + (cancelReq.count ?? 0), center: center.count ?? 0, support: support.count ?? 0,
          refunds: refunds.count ?? 0, payouts: payouts.count ?? 0 }} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
