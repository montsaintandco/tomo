import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { formatPrice, formatWithConversion, convertPrice } from "@/lib/currency";
import { proxyEstimateJpy } from "@/lib/fees";
import { mercariItem } from "@/lib/market/mercari";
import { yahooAuctionItem } from "@/lib/market/yahoo-auction";
import { daangnItem } from "@/lib/market/daangn";
import { joongnaItem } from "@/lib/market/joongna";
import { SOURCE_LABEL, LIVE_SOURCES, type MarketSource, type MarketItemDetail } from "@/lib/market/types";
import ProxyRequestButton from "@/components/ProxyRequestButton";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic"; // 가격·품절은 진입 시점 확인

async function loadItem(source: MarketSource, id: string): Promise<MarketItemDetail | null> {
  try {
    if (source === "mercari") return await mercariItem(id);
    if (source === "yahoo_auction") return await yahooAuctionItem(id);
    if (source === "daangn") return await daangnItem(id);
    if (source === "joongna") return await joongnaItem(id);
  } catch {
    return null; // 파서 실패·품절·차단 → 캐시 폴백
  }
  return null;
}

export default async function ExternalItemPage({ params }: {
  params: { source: string; id: string };
}) {
  const source = params.source as MarketSource;
  if (!SOURCE_LABEL[source]) notFound();

  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);

  const live = LIVE_SOURCES.includes(source) ? await loadItem(source, params.id) : null;

  // 캐시 폴백 (파서 실패 또는 한국 소스의 어드민 등록분)
  const { data: cached } = await supabase.from("external_items")
    .select("*").eq("source", source).eq("source_id", params.id).maybeSingle();
  if (!live && !cached) notFound();

  const item: MarketItemDetail = live ?? {
    source, sourceId: cached!.source_id, url: cached!.url,
    title: cached!.title_translated || cached!.title,
    price: cached!.price, currency: cached!.currency as "KRW" | "JPY",
    thumb: (cached!.images as string[])[0] ?? "", soldOut: cached!.status === "sold",
    auction: false,
    description: "", images: (cached!.images as string[]) ?? [],
    sellerName: cached!.seller_name ?? "", condition: "", extra: {},
  };
  const stale = !live && !!cached;

  const est = item.currency === "JPY" ? proxyEstimateJpy(item.price) : null;
  const rate = viewer.currency === "KRW" && item.currency === "JPY" ? viewer.rate : 1;

  return (
    <main className="mx-auto max-w-md pb-28">
      <div className="grid grid-cols-1 gap-1">
        {(item.images.length ? item.images : [item.thumb]).filter(Boolean).slice(0, 6).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" className="aspect-square w-full object-cover" />
        ))}
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-tomo-navy px-2.5 py-1 text-[11px] font-bold text-white">
            {SOURCE_LABEL[source]}
          </span>
          {item.auction && (
            <span className="rounded-full bg-tomo-coral px-2.5 py-1 text-[11px] font-bold text-white">입찰 진행</span>
          )}
          {item.soldOut && (
            <span className="rounded-full bg-gray-400 px-2.5 py-1 text-[11px] font-bold text-white">품절</span>
          )}
        </div>

        <h1 className="text-base font-bold leading-snug">{item.title}</h1>

        <div>
          <p className="text-xl font-bold text-tomo-navy">
            {formatWithConversion(item.price, item.currency, rate, viewer.currency)}
          </p>
          {item.auction && <p className="mt-0.5 text-xs text-gray-500">현재가 — 낙찰가는 달라질 수 있어요</p>}
        </div>

        {est && (
          <div className="rounded-card bg-tomo-ivory p-3 text-xs">
            <p className="mb-2 font-bold text-tomo-navy">예상 결제 금액 (견적 전 참고치)</p>
            <div className="flex justify-between"><span className="text-gray-500">상품가</span><span>{formatPrice(est.item, "JPY")}</span></div>
            <div className="mt-0.5 flex justify-between"><span className="text-gray-500">대행 수수료</span><span>{formatPrice(est.fee, "JPY")}</span></div>
            <div className="mt-0.5 flex justify-between"><span className="text-gray-500">현지 결제·송금</span><span>{formatPrice(est.remit, "JPY")}</span></div>
            <div className="mt-0.5 flex justify-between"><span className="text-gray-500">국제배송(예상)</span><span>{formatPrice(est.shipping, "JPY")}</span></div>
            <div className="mt-2 flex justify-between border-t pt-2 font-bold">
              <span>합계</span>
              <span className="text-tomo-navy">
                {formatPrice(est.total, "JPY")}
                {viewer.currency === "KRW" && ` (약 ${formatPrice(convertPrice(est.total, "JPY", viewer.rate), "KRW")})`}
              </span>
            </div>
            <p className="mt-2 text-[10px] text-gray-400">
              무게·부피에 따라 국제배송비가 달라져요. 신청 후 정확한 견적을 보내드립니다.
            </p>
          </div>
        )}

        {item.description && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{item.description}</p>
        )}

        {(item.sellerName || item.condition || Object.keys(item.extra).length > 0) && (
          <div className="rounded-card border bg-white p-3 text-xs text-gray-600">
            {item.sellerName && <p>판매자: {item.sellerName}</p>}
            {item.condition && <p className="mt-1">상품 상태: {item.condition}</p>}
            {Object.entries(item.extra).filter(([, v]) => v).map(([k, v]) => (
              <p key={k} className="mt-1">{k}: {v}</p>
            ))}
          </div>
        )}

        {stale && (
          <p className="rounded-card bg-gray-100 p-3 text-xs text-gray-500">
            원본 정보를 불러오지 못해 저장된 정보를 표시하고 있어요. 가격·재고가 바뀌었을 수 있어요.
          </p>
        )}

        <a href={item.url} target="_blank" rel="noopener noreferrer"
          className="text-center text-xs text-gray-400 underline">
          원본 상품 페이지 열기
        </a>
      </div>

      <div className="fixed bottom-0 left-0 right-0 mx-auto max-w-md border-t bg-white p-3">
        {viewer.guest ? (
          <Link href={`/login?next=/global/${source}/${params.id}`}
            className="block rounded-full bg-tomo-coral py-3 text-center font-bold text-white">
            로그인하고 대행 신청 · ログインして代行依頼
          </Link>
        ) : item.soldOut ? (
          <button disabled className="w-full rounded-full bg-gray-300 py-3 font-bold text-white">품절된 상품이에요</button>
        ) : (
          <ProxyRequestButton
            source={source} sourceId={params.id}
            title={item.title} price={item.price} currency={item.currency}
            url={item.url} images={item.images.length ? item.images : [item.thumb].filter(Boolean)}
            sellerName={item.sellerName}
          />
        )}
      </div>
    </main>
  );
}
