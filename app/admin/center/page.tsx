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

// 운영자 화면은 한국어 고정. 토큰만 v2
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
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-3xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">센터 관리</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>
      {(["SEOUL", "NARITA"] as const).map((c) => {
        const items = rows.filter((r) => r.center === c);
        return (
          <section key={c} className="mb-6">
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">
              {c === "SEOUL" ? "서울 센터" : "나리타 센터"} <span className="tnum text-ink-soft">({items.length})</span>
            </h2>
            <div className="flex flex-col gap-2">
              {items.map((r) => (
                <Link key={r.id} href={`/transactions/${r.id}`} className="card flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{r.listings?.title ?? "—"}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {r.seller?.nickname} → {r.buyer?.nickname}
                      {r.domestic_tracking && <span className="tnum"> · {r.domestic_tracking}</span>}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    r.status === "shipped_to_center" ? "bg-tomo-coral-deep text-white" : "bg-tomo-navy/5 text-tomo-navy"}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </Link>
              ))}
              {items.length === 0 && (
                <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-xs text-ink-soft">대기 중인 거래 없음</p>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
