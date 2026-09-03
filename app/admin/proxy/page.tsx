import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice } from "@/lib/currency";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import QuoteForm from "@/components/QuoteForm";
import ProxyActions from "@/components/ProxyActions";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { redirect } from "next/navigation";

const LABEL: Record<string, string> = {
  requested: "견적 대기", quoted: "고객 승인 대기", approved: "결제 확인 필요",
  paid: "구매 진행", purchasing: "센터 입고 대기", center_received: "국제 발송 대기",
  shipped_international: "배송중", delivered: "수령 확인 대기",
};
const OPEN = ["requested", "quoted", "approved", "paid", "purchasing", "center_received", "shipped_international", "delivered"];
// 운영자가 지금 움직여야 하는 상태 — 코랄딥으로 표시
const NEEDS_ACTION = new Set(["requested", "approved", "paid", "purchasing", "center_received"]);

type Row = {
  id: string; status: string; note: string;
  quote_item_price: number | null; quote_total: number | null;
  external_items: { source: string; source_id: string; title: string; price: number; images: string[] } | null;
  profiles: { nickname: string } | null;
};

// 운영자 화면은 한국어 고정. 토큰만 v2
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
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-3xl md:px-6 md:pb-16 md:pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[17px] font-extrabold leading-tight text-ink md:text-xl">구매대행 관리</h1>
        <Link href="/admin" className="press text-[13px] font-bold text-tomo-navy">← 운영</Link>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const it = r.external_items;
          return (
            <div key={r.id} className="card p-3.5">
              <div className="mb-3 flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
                  {it?.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-6 w-9 opacity-60" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] text-ink">{it?.title ?? "상품"}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      NEEDS_ACTION.has(r.status) ? "bg-tomo-coral-deep text-white" : "bg-tomo-navy/5 text-tomo-navy"}`}>
                      {LABEL[r.status] ?? r.status}
                    </span>
                    {it ? SOURCE_LABEL[it.source as MarketSource] : ""} · {r.profiles?.nickname}
                    {it && <span className="tnum"> · 원가 {formatPrice(it.price, "JPY")}</span>}
                  </p>
                </div>
                <Link href={`/proxy/${r.id}`} className="press shrink-0 py-1 text-[13px] font-bold text-tomo-navy">상세 →</Link>
              </div>

              {r.note && (
                <p className="mb-3 rounded-card bg-tomo-navy/5 p-2.5 text-[12px] text-ink">
                  {/\[묶음배송 희망\]|\[まとめて発送希望\]/.test(r.note) && (
                    <span className="mr-1.5 rounded-full bg-tomo-navy px-2 py-0.5 text-[11px] font-bold text-white">묶음</span>
                  )}
                  요청: {r.note}
                </p>
              )}

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
          <div className="mt-14 flex flex-col items-center text-center">
            <TomoSymbol />
            <p className="mt-3 text-sm text-ink-soft">처리할 대행 신청이 없어요</p>
          </div>
        )}
      </div>
    </main>
  );
}
