import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import AdminNav from "@/components/admin/AdminNav";
import { redirect } from "next/navigation";

export const metadata = { title: "운영 | TOMO" };

// 어드민 셸 — 권한 가드 한 곳 + Linear식 사이드바. 사용자 앱 크롬(GNB·푸터·탭바)은 /admin에서 숨긴다
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin");
  if (!viewer.isAdmin) redirect("/");

  const [disputes, proxy, center, me] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("status", "disputed"),
    supabase.from("proxy_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "approved", "paid", "purchasing", "center_received"]),
    supabase.from("transactions").select("id", { count: "exact", head: true }).in("status", ["shipped_to_center", "center_received"]),
    supabase.from("profiles").select("nickname").eq("id", viewer.id).single(),
  ]);

  return (
    <div className="admin md:flex">
      <AdminNav nickname={me.data?.nickname ?? "운영자"}
        counts={{ disputes: disputes.count ?? 0, proxy: proxy.count ?? 0, center: center.count ?? 0 }} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
