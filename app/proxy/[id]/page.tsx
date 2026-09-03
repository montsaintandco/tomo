import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/listings";
import { formatPrice, convertPrice, type Currency } from "@/lib/currency";
import { SOURCE_LABEL, type MarketSource } from "@/lib/market/types";
import ProxyActions from "@/components/ProxyActions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

const STEPS = [
  ["requested", "신청 접수"], ["quoted", "견적 도착"], ["approved", "견적 승인"],
  ["paid", "결제 완료"], ["purchasing", "현지 구매중"], ["center_received", "센터 입고"],
  ["shipped_international", "국제 발송"], ["delivered", "배송 도착"], ["completed", "거래 완료"],
] as const;

type Row = {
  id: string; status: string; note: string; center: string | null; intl_tracking: string | null;
  quote_item_price: number | null; quote_fee: number | null;
  quote_shipping: number | null; quote_total: number | null;
  user_id: string;
  external_items: {
    source: string; source_id: string; title: string; title_translated: string | null;
    price: number; currency: Currency; images: string[]; url: string;
  } | null;
};

export default async function ProxyDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect(`/login?next=/proxy/${params.id}`);

  const { data } = await supabase.from("proxy_requests")
    .select(`id, status, note, center, intl_tracking, user_id,
      quote_item_price, quote_fee, quote_shipping, quote_total,
      external_items(source, source_id, title, title_translated, price, currency, images, url)`)
    .eq("id", params.id).maybeSingle();
  if (!data) notFound(); // RLS: 본인/어드민만

  const r = data as unknown as Row;
  const item = r.external_items;
  const isOwner = r.user_id === viewer.id;
  const cur = Math.max(0, STEPS.findIndex(([s]) => s === r.status));
  const cancelled = r.status === "cancelled";

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-tomo-navy">구매대행 · 代行</h1>

      {item && (
        <Link href={`/global/${item.source}/${item.source_id}`}
          className="mb-4 flex items-center gap-3 rounded-card border bg-white p-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-card bg-tomo-navy/5">
            {item.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.images[0]} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-bold">{item.title_translated || item.title}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {SOURCE_LABEL[item.source as MarketSource]} · {formatPrice(item.price, item.currency)}
            </p>
          </div>
        </Link>
      )}

      <div className="mb-4 rounded-card border bg-white p-4">
        {cancelled ? (
          <p className="text-center text-sm font-bold text-ink-soft">취소된 신청이에요</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {STEPS.map(([s, label], i) => (
              <li key={s} className="flex items-center gap-3">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i < cur ? "bg-tomo-blue text-white" : i === cur ? "bg-tomo-coral-deep text-white" : "bg-tomo-navy/10 text-ink-faint"}`}>
                  {i < cur ? "✓" : i + 1}
                </span>
                <span className={`text-sm ${i === cur ? "font-bold text-tomo-navy" : i < cur ? "text-ink-soft" : "text-ink-faint"}`}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {r.quote_total != null ? (
        <div className="mb-4 rounded-card border bg-white p-4 text-sm">
          <p className="mb-2 font-bold text-tomo-navy">견적</p>
          <div className="flex justify-between"><span className="text-ink-soft">상품가</span><span>{formatPrice(r.quote_item_price ?? 0, "JPY")}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-soft">대행 수수료</span><span>{formatPrice(r.quote_fee ?? 0, "JPY")}</span></div>
          <div className="mt-1 flex justify-between"><span className="text-ink-soft">국제배송비</span><span>{formatPrice(r.quote_shipping ?? 0, "JPY")}</span></div>
          <div className="mt-2 flex justify-between border-t pt-2 font-bold">
            <span>합계</span>
            <span className="text-tomo-navy">
              {formatPrice(r.quote_total, "JPY")}
              {viewer.currency === "KRW" && ` (약 ${formatPrice(convertPrice(r.quote_total, "JPY", viewer.rate), "KRW")})`}
            </span>
          </div>
        </div>
      ) : (
        <p className="mb-4 rounded-card bg-tomo-ivory p-3 text-center text-xs text-ink-soft">
          견적을 준비하고 있어요. 확정되면 알려드릴게요.
        </p>
      )}

      {r.intl_tracking && (
        <p className="mb-4 rounded-card border bg-white p-3 text-xs text-ink-soft">국제 운송장: {r.intl_tracking}</p>
      )}

      <ProxyActions id={r.id} status={r.status} isOwner={isOwner} isAdmin={viewer.isAdmin} />
    </main>
  );
}
