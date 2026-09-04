import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { formatPrice, convertPrice } from "@/lib/currency";
import { proxyEstimateJpy } from "@/lib/fees";
import { mercariItem } from "@/lib/market/mercari";
import { yahooAuctionItem } from "@/lib/market/yahoo-auction";
import { daangnItem } from "@/lib/market/daangn";
import { joongnaItem } from "@/lib/market/joongna";
import { SOURCE_LABEL, LIVE_SOURCES, SOURCE_CURRENCY, type MarketSource, type MarketItemDetail } from "@/lib/market/types";
import { t, type Lang } from "@/lib/i18n";
import ProxyRequestButton from "@/components/ProxyRequestButton";
import MarketCarousel from "@/components/MarketCarousel";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { Fragment } from "react";
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

// 게시 시각 상대 표기 (ListingRow와 같은 규칙)
function ago(iso: string, lang: Lang): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(m) || m < 0) return "";
  if (m < 1) return t(lang, "time.now");
  if (m < 60) return t(lang, "time.min", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t(lang, "time.hour", { n: h });
  const d = Math.floor(h / 24);
  return d < 30 ? t(lang, "time.day", { n: d }) : t(lang, "time.month", { n: Math.floor(d / 30) });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex justify-between gap-3 first:mt-0">
      <span className="text-ink-soft">{label}</span>
      <span className="tnum text-ink">{value}</span>
    </div>
  );
}

export default async function ExternalItemPage(props: {
  params: Promise<{ source: string; id: string }>;
}) {
  const params = await props.params;
  const source = params.source as MarketSource;
  if (!SOURCE_LABEL[source]) notFound();

  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const lang: Lang = viewer.language;

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
  const images = (item.images.length ? item.images : [item.thumb]).filter(Boolean).slice(0, 6);

  // 구매자 통화가 큰 숫자 — 같은 통화면 환산 없이
  const foreign = item.currency !== viewer.currency;
  const buyerPrice = foreign
    ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(item.price, item.currency, viewer.rate), viewer.currency)}`
    : formatPrice(item.price, item.currency);
  const est = item.currency === "JPY" ? proxyEstimateJpy(item.price) : null;
  const sourceLang: Lang = SOURCE_CURRENCY[source] === "JPY" ? "ja" : "ko";

  return (
    <main className="mx-auto max-w-md pb-24 standalone:pb-28 md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-8">
      {/* 이미지 컬럼 — 상품 상세와 같은 골격. 이미지 없으면 브랜드 심볼 */}
      <div className="relative md:sticky md:top-24 md:overflow-hidden md:rounded-card md:shadow-soft">
        <Link href="/global" aria-label={t(lang, "detail.back")}
          className="press absolute left-3 top-3 z-10 hidden standalone:flex h-11 w-11 items-center justify-center rounded-full bg-tomo-navy/60 backdrop-blur-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        {images.length > 0 ? (
          <div className="grid grid-cols-1 gap-1 bg-tomo-navy/5">
            {images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="aspect-square w-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
            ))}
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-tomo-navy/5">
            <TomoSymbol className="h-20 w-28 opacity-60" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-4 md:p-0">
        {/* 뱃지 행 — 소스는 네이비, 경매는 코랄딥(행동 신호), 품절은 스크림 톤 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-tomo-navy px-2.5 py-1 text-[11px] font-bold text-white">
            {t(lang, `source.${source}`)}
          </span>
          {item.auction && (
            <span className="rounded-full bg-tomo-coral-deep px-2.5 py-1 text-[11px] font-bold text-white">{t(lang, "badge.auction")}</span>
          )}
          {item.soldOut && (
            <span className="rounded-full bg-tomo-navy/70 px-2.5 py-1 text-[11px] font-bold text-white">{t(lang, "badge.soldOut")}</span>
          )}
        </div>

        <h1 lang={sourceLang} className="text-[17px] font-bold leading-snug text-ink">{item.title}</h1>

        {/* 원본 맥락 한 줄 — 카테고리 · 게시 시각 · 조회/관심/채팅 (당근·메루카리가 보여주는 것을 그대로) */}
        {(item.category || item.postedAt || item.counts) && (
          <p className="-mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-soft">
            {item.category && <span lang={sourceLang}>{item.category}</span>}
            {item.category && item.postedAt && <span aria-hidden>·</span>}
            {item.postedAt && <time dateTime={item.postedAt} className="tnum">{ago(item.postedAt, lang)}</time>}
            {item.counts && Object.values(item.counts).some((v) => v != null) && (
              <span className="tnum basis-full">
                {[
                  item.counts.chats != null && t(lang, source === "mercari" ? "ext.comments" : "ext.chats", { n: item.counts.chats }),
                  item.counts.favorites != null && t(lang, source === "mercari" ? "ext.likes" : source === "yahoo_auction" ? "ext.watch" : "ext.favorites", { n: item.counts.favorites }),
                  item.counts.bids != null && t(lang, "ext.bids", { n: item.counts.bids }),
                  item.counts.views != null && t(lang, "ext.views", { n: item.counts.views }),
                ].filter(Boolean).join(" · ")}
              </span>
            )}
          </p>
        )}
        {item.tradeTags && item.tradeTags.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-1">
            {item.tradeTags.map((tag) => (
              <span key={tag} lang={sourceLang} className="rounded-full bg-tomo-navy/5 px-2 py-0.5 text-[11px] font-bold text-tomo-navy">{tag}</span>
            ))}
          </div>
        )}

        <div>
          <p className="tnum text-[17px] font-extrabold leading-tight text-ink">{buyerPrice}</p>
          {foreign && <p className="tnum mt-0.5 text-xs font-bold text-ink-soft">{formatPrice(item.price, item.currency)}</p>}
          {item.auction && <p className="mt-1 text-[11px] text-ink-faint">{t(lang, "ext.auctionNote")}</p>}
        </div>

        {/* 예상 금액표 — 구조 틴트 웰 (아이보리는 틴트 3곳 전용) */}
        {est && (
          <div className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px]">
            <p className="mb-2 font-bold text-tomo-navy">{t(lang, "ext.estimateTitle")}</p>
            <Row label={t(lang, "ext.item")} value={formatPrice(est.item, "JPY")} />
            <Row label={t(lang, "ext.fee")} value={formatPrice(est.fee, "JPY")} />
            <Row label={t(lang, "ext.remit")} value={formatPrice(est.remit, "JPY")} />
            <Row label={t(lang, "ext.shipping")} value={formatPrice(est.shipping, "JPY")} />
            {/* SAZO식 총액 투명성 — 관세는 금액을 지어내지 않고 면세 기준만 말한다 */}
            <div className="mt-1 flex justify-between gap-3">
              <span className="text-ink-soft">{t(lang, "ext.customs")}</span>
              <span className="text-right text-[11px] leading-snug text-ink-soft">{t(lang, "ext.customsNote")}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
              <span className="font-bold text-ink">{t(lang, "ext.total")}</span>
              <span className="text-right">
                <span className="tnum block text-[15px] font-extrabold text-tomo-navy">
                  {viewer.currency === "KRW"
                    ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(est.total, "JPY", viewer.rate), "KRW")}`
                    : formatPrice(est.total, "JPY")}
                </span>
                {viewer.currency === "KRW" && <span className="tnum block text-[11px] font-bold text-ink-soft">{formatPrice(est.total, "JPY")}</span>}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{t(lang, "ext.estimateNote")}</p>
          </div>
        )}

        {/* 설명은 본문이다 — 보조색이 아니라 잉크 */}
        {item.description ? (
          <p lang={sourceLang} className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{item.description}</p>
        ) : (
          <p className="text-sm text-ink-soft">{t(lang, "ext.noDescription")}</p>
        )}

        {/* 판매자 카드 — 닉네임 · 동네 · 매너온도(원본 마켓 기준) */}
        {(item.sellerName || item.region || item.sellerTemp != null) && (
          <div className="card flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tomo-navy/5 text-sm font-bold text-tomo-navy">
              {(item.sellerName || "?").slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink" lang={sourceLang}>{item.sellerName || t(lang, "ext.seller")}</span>
              {item.region && <span className="block truncate text-[12px] text-ink-soft" lang={sourceLang}>{item.region}</span>}
              {item.sellerRating && <span className="tnum block truncate text-[12px] text-ink-soft">{t(lang, "ext.sellerRating")} {item.sellerRating}</span>}
            </span>
            {item.sellerTemp != null && (
              <span className="shrink-0 text-right">
                <span className="tnum block text-[15px] font-extrabold text-tomo-navy">{item.sellerTemp.toFixed(1)}°</span>
                <span className="block text-[10px] text-ink-soft">{t(lang, "ext.sellerTemp")}</span>
              </span>
            )}
          </div>
        )}

        {/* 판매자의 다른 상품 — 같은 마켓 카드로, 원본 판매자 페이지 링크 */}
        {((item.sellerItems && item.sellerItems.length > 0) || item.sellerUrl) && (
          <section aria-label={t(lang, "ext.sellerItems")} className="pt-1">
            <div className="mb-2 flex items-end justify-between gap-3">
              <h2 className="text-[15px] font-extrabold text-ink">{t(lang, "ext.sellerItems")}</h2>
              {item.sellerUrl && (
                <a href={item.sellerUrl} target="_blank" rel="noopener noreferrer"
                  className="press -my-2 -mr-2 shrink-0 py-2 pl-2 pr-2 text-[13px] font-bold text-tomo-navy">
                  {t(lang, "ext.sellerItemsMore")} ↗
                </a>
              )}
            </div>
            {item.sellerItems && item.sellerItems.length > 0 ? (
              <MarketCarousel items={item.sellerItems} rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} />
            ) : (
              <p className="text-[12px] text-ink-soft">{t(lang, "ext.sellerItemsMore")} ↗</p>
            )}
          </section>
        )}

        {(item.condition || Object.keys(item.extra).length > 0) && (
          <dl className="card grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-3.5 text-xs text-ink-soft">
            {item.condition && <><dt className="font-bold text-ink">{t(lang, "ext.condition")}</dt><dd lang={sourceLang}>{item.condition}</dd></>}
            {Object.entries(item.extra).filter(([, v]) => v).map(([k, v]) => (
              <Fragment key={k}><dt className="font-bold text-ink" lang={sourceLang}>{k}</dt><dd lang={sourceLang}>{v}</dd></Fragment>
            ))}
          </dl>
        )}

        {stale && (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-xs leading-relaxed text-ink-soft">{t(lang, "ext.stale")}</p>
        )}

        <a href={item.url} target="_blank" rel="noopener noreferrer"
          className="press self-center py-2 text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
          {t(lang, "ext.openOriginal")} ↗
        </a>

        {/* CTA — 모바일은 하단 고정 바, 데스크톱은 정보 컬럼 안에서 흐름 배치 */}
        <div className="fixed bottom-0 standalone:bottom-[62px] left-0 right-0 z-20 mx-auto max-w-md border-t border-tomo-navy/5 bg-white/95 p-3 backdrop-blur md:static md:mt-2 md:max-w-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
          {viewer.guest ? (
            <Link href={`/login?next=/global/${source}/${params.id}`}
              className="btn block bg-tomo-coral-deep py-3 text-center text-sm text-white">
              {t(lang, "ext.loginCta")}
            </Link>
          ) : item.soldOut ? (
            <button disabled className="btn w-full bg-tomo-navy/70 py-3 text-sm text-white">{t(lang, "ext.soldOutCta")}</button>
          ) : (
            <ProxyRequestButton lang={lang}
              source={source} sourceId={params.id}
              title={item.title} price={item.price} currency={item.currency}
              url={item.url} images={images}
              sellerName={item.sellerName}
            />
          )}
        </div>
      </div>
    </main>
  );
}
