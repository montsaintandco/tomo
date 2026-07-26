import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice } from "@/lib/currency";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import QuoteForm from "@/components/QuoteForm";
import ProxyActions from "@/components/ProxyActions";
import Link from "next/link";
import { redirect } from "next/navigation";

const LABEL: Record<string, string> = {
  requested: "견적 대기", quoted: "고객 승인 대기", approved: "결제 확인 필요",
  paid: "구매 진행", purchasing: "센터 입고 대기", center_received: "국제 발송 대기",
  shipped_international: "배송중", delivered: "수령 확인 대기",
};
const OPEN = ["requested", "quoted", "approved", "paid", "purchasing", "center_received", "shipped_international", "delivered"];

type Row = {
  id: string; status: string; note: string;
  quote_item_price: number | null; quote_total: number | null;
  external_items: { source: string; source_id: string; title: string; price: number; images: string[] } | null;
  profiles: { nickname: string } | null;
};

export default async function AdminProxyPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/login?next=/admin/proxy");
  if (!viewer.isAdmin) redirect("/");

  const { data } = await supabase.from("proxy_requests")
    .select(`id, status, note, quote_item_price, quote_total,
      external_items(source, source_id, title, price, images),
      profiles!proxy_requests_user_id_fkey(nickname)`)
    .in("status", OPEN).order("created_at", { ascending: true });
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-tomo-navy">구매대행 관리</h1>
        <Link href="/admin" className="text-xs text-gray-500">← 운영</Link>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const it = r.external_items;
          return (
            <div key={r.id} className="rounded-card border bg-white p-3">
              <div className="mb-2 flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-card bg-gray-100">
                  {it?.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.images[0]} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-bold">{it?.title ?? "상품"}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {it ? SOURCE_LABEL[it.source as MarketSource] : ""} · {r.profiles?.nickname} · {LABEL[r.status] ?? r.status}
                  </p>
                  {it && <p className="text-xs text-gray-400">원가 {formatPrice(it.price, "JPY")}</p>}
                </div>
                <Link href={`/proxy/${r.id}`} className="shrink-0 text-xs text-tomo-navy">상세</Link>
              </div>

              {r.note && <p className="mb-2 rounded-card bg-tomo-ivory p-2 text-xs text-gray-600">요청: {r.note}</p>}

              {(r.status === "requested" || r.status === "quoted") ? (
                <QuoteForm id={r.id}
                  defaultItemPrice={r.quote_item_price ?? it?.price ?? 0}
                  quoted={r.status === "quoted"}
                  total={r.quote_total} />
              ) : (
                <ProxyActions id={r.id} status={r.status} isOwner={false} isAdmin />
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="mt-16 text-center text-sm text-gray-400">처리할 대행 신청이 없어요</p>
        )}
      </div>
    </main>
  );
}
