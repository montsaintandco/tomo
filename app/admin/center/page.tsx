import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import Link from "next/link";
import { redirect } from "next/navigation";

type Row = {
  id: string; status: string; center: string | null;
  domestic_tracking: string | null;
  listings: { title: string } | null;
  buyer: { nickname: string } | null;
  seller: { nickname: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  shipped_to_center: "입고 대기",
  center_received: "국제발송 대기",
};

export default async function AdminCenterPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");
  if (!viewer.isAdmin) redirect("/");

  // admin SELECT RLS(0010)로 당사자 아니어도 조회 가능
  const { data } = await supabase.from("transactions")
    .select(`id, status, center, domestic_tracking,
      listings(title),
      buyer:profiles!transactions_buyer_id_fkey(nickname),
      seller:profiles!transactions_seller_id_fkey(nickname)`)
    .in("status", ["shipped_to_center", "center_received"])
    .order("updated_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-tomo-navy">센터 관리 · センター管理</h1>
      {(["SEOUL", "NARITA"] as const).map((c) => {
        const items = rows.filter((r) => r.center === c);
        return (
          <section key={c} className="mb-5">
            <h2 className="mb-2 text-sm font-bold text-ink-soft">
              {c === "SEOUL" ? "서울 센터" : "나리타 센터"} ({items.length})
            </h2>
            <div className="flex flex-col gap-2">
              {items.map((r) => (
                <Link key={r.id} href={`/transactions/${r.id}`}
                  className="flex items-center justify-between rounded-card border bg-white p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{r.listings?.title ?? "—"}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {r.seller?.nickname} → {r.buyer?.nickname}
                      {r.domestic_tracking && ` · ${r.domestic_tracking}`}
                    </p>
                  </div>
                  <span className="ml-2 shrink-0 rounded-full bg-tomo-blue/40 px-2 py-1 text-[11px] font-bold text-tomo-navy">
                    {STATUS_LABEL[r.status]}
                  </span>
                </Link>
              ))}
              {items.length === 0 && (
                <p className="rounded-card bg-tomo-ivory p-3 text-center text-xs text-ink-faint">
                  대기 중인 거래 없음
                </p>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
