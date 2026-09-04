import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { formatPrice, convertPrice } from "@/lib/currency";
import { proxyEstimate } from "@/lib/fees";
import { loadItem } from "@/lib/market/item";
import { SOURCE_LABEL, LIVE_SOURCES, SOURCE_CURRENCY, type MarketSource, type MarketItemDetail } from "@/lib/market/types";
import { t, type Lang } from "@/lib/i18n";
import ProxyRequestButton from "@/components/ProxyRequestButton";
import CartButtons from "@/components/CartButtons";
import MarketCarousel from "@/components/MarketCarousel";
import Gallery from "@/components/Gallery";
import ExternalItemCard from "@/components/ExternalItemCard";
import { searchSource } from "@/lib/market/search";
import { Suspense } from "react";
import { TomoSymbol, CountryChip } from "@/components/Brand";
import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic"; // 가격·품절은 진입 시점 확인

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

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-0.5 ${strong ? "border-t border-tomo-navy/10 pt-1.5 font-bold text-ink" : ""}`}>
      <span className={strong ? "" : "text-ink-soft"}>{label}</span>
      <span className="tnum">{value}</span>
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
    ? formatPrice(convertPrice(item.price, item.currency, viewer.rate), viewer.currency)
    : formatPrice(item.price, item.currency);
  // 견적은 국경을 넘을 때만 — 같은 나라 상품은 대행이 필요 없다 (양방향 모두)
  const est = foreign ? proxyEstimate(item.price, item.currency) : null;
  const toViewer = (n: number) => (foreign ? convertPrice(n, item.currency, viewer.rate) : n);
  // 사줘식: 금액은 뷰어 통화 하나로만, "약" 없이 — 환율 기준은 표 아래 한 줄로
  const v = (n: number) => formatPrice(toViewer(n), viewer.currency);
  const totalLabel = est ? v(est.total) : buyerPrice;
  const sourceLang: Lang = SOURCE_CURRENCY[source] === "JPY" ? "ja" : "ko";
  const sourceCountry = SOURCE_CURRENCY[source] === "JPY" ? "JP" : "KR";

  return (
    <main className="mx-auto max-w-md pb-24 standalone:pb-28 md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-8">
      {/* 이미지 컬럼 — 상품 상세와 같은 골격. 이미지 없으면 브랜드 심볼 */}
      <div className="relative md:sticky md:top-24">
        <Link href="/global" aria-label={t(lang, "detail.back")}
          className="press absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-tomo-navy/60 backdrop-blur-sm md:hidden">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        {images.length > 0 ? (
          <Gallery key={`${source}:${params.id}`} images={images} alt={item.title} lang={sourceLang} counter={t(lang, "ext.photos", { n: images.length })}
            prevLabel={t(lang, "ext.prevPhoto")} nextLabel={t(lang, "ext.nextPhoto")} />
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
          {est ? (
            <>
              <p className="text-[12px] font-bold text-ink-soft">{item.auction ? t(lang, "ext.estimateCurrent") : t(lang, "ext.totalLabel")}</p>
              <p className="tnum text-[17px] font-extrabold leading-tight text-ink">{totalLabel}</p>
              <p className="tnum mt-0.5 text-xs font-bold text-ink-soft">
                {t(lang, "ext.listPrice")} {v(est.item)} · {formatPrice(item.price, item.currency)}
              </p>
            </>
          ) : (
            <p className="tnum text-[17px] font-extrabold leading-tight text-ink">{buyerPrice}</p>
          )}
          {item.auction && <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "ext.auctionNote")}</p>}
        </div>

        {/* 대행 진행 안내 — 원칙 1: 안전장치를 결정 지점에서 보인다. 사실만, 수치 없음 */}
        {est && (
          <ol className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px] text-ink">
            <li className="mb-2 font-bold text-tomo-navy">{t(lang, "ext.howItWorks")}</li>
            {(["ext.step1", "ext.step2", "ext.step3", "ext.step4"] as const).map((k, i) => (
              <li key={k} className="mt-1 flex gap-2">
                <span className="tnum flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tomo-navy text-[11px] font-bold text-white">{i + 1}</span>
                <span className="leading-snug">{t(lang, k)}</span>
              </li>
            ))}
          </ol>
        )}

        {/* 예상 금액표 — 구조 틴트 웰 (아이보리는 틴트 3곳 전용) */}
        {est && (
          <div className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px]">
            <p className="mb-2 font-bold text-tomo-navy">{item.auction ? t(lang, "ext.estimateCurrent") : t(lang, "ext.estimateTitle")}</p>
            <Row label={t(lang, "ext.item")} value={v(est.item)} />
            <Row label={t(lang, "ext.localShip")} value={v(est.localShipping)} />
            <Row label={t(lang, "ext.subtotal")} value={v(est.subtotal)} strong />
            <Row label={t(lang, "ext.shipping")} value={v(est.intlShipping)} />
            <Row label={t(lang, "ext.serviceFee")} value={v(est.serviceFee)} />
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-tomo-navy/10 pt-2">
              <span className="font-bold text-ink">{t(lang, "ext.total")}</span>
              <span className="tnum text-[17px] font-extrabold text-tomo-navy">{totalLabel}</span>
            </div>
            <p className="mt-1 text-[12px] font-bold text-tomo-navy">{t(lang, "ext.oncePayment")}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{t(lang, "ext.estimateNote")}</p>
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
              <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-soft"><CountryChip country={sourceCountry} />{t(lang, "ext.sellerTempNote")}</span>
            </span>
            {item.sellerTemp != null && (
              <span className="shrink-0 text-right">
                <span className="tnum block text-[15px] font-extrabold text-tomo-navy">{item.sellerTemp.toFixed(1)}°</span>
                <span className="block text-[11px] text-ink-soft">{t(lang, "ext.sellerTemp")}</span>
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
            {item.sellerItems && item.sellerItems.length > 0 && (
              <MarketCarousel items={item.sellerItems} rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} label={t(lang, "ext.sellerItems")} />
            )}
          </section>
        )}

        {/* 비슷한 상품 — 같은 마켓에서 제목 키워드로 검색, 스트리밍 */}
        <section aria-label={t(lang, "ext.similar")} className="pt-1">
          <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "ext.similar")}</h2>
          <Suspense fallback={<SimilarSkeleton />}>
            <Similar source={source} id={params.id} title={item.title} rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} />
          </Suspense>
        </section>

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
        <div className="fixed bottom-0 standalone:bottom-[62px] left-0 right-0 z-20 mx-auto max-w-md border-t border-tomo-navy/5 bg-white/95 p-3 backdrop-blur md:sticky md:bottom-4 md:mt-2 md:max-w-none md:rounded-card md:border md:p-3 md:shadow-lift">
          {!foreign ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] text-ink-soft">{t(lang, "ext.domesticNote")}</p>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn block bg-tomo-navy py-3 text-center text-sm text-white">
                {t(lang, "ext.openDirect")} ↗
              </a>
            </div>
          ) : item.soldOut ? (
            <button disabled className="btn w-full bg-tomo-navy/70 py-3 text-sm text-white">{t(lang, "ext.soldOutCta")}</button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 shrink-0">
                <p className="text-[11px] font-bold text-ink-soft">{t(lang, "ext.totalLabel")}</p>
                <p className="tnum text-[15px] font-extrabold leading-tight text-ink">{totalLabel}</p>
              </div>
              <div className="min-w-0 flex-1">
                {viewer.guest ? (
                  <Link href={`/login?next=/global/${source}/${params.id}`}
                    className="btn block bg-tomo-coral-deep py-3 text-center text-sm text-white">
                    {t(lang, "ext.loginCta")}
                  </Link>
                ) : item.auction ? (
                  <ProxyRequestButton lang={lang} auction totalLabel={totalLabel}
                    source={source} sourceId={params.id}
                    title={item.title} price={item.price} currency={item.currency}
                    url={item.url} images={images} sellerName={item.sellerName} />
                ) : (
                  <CartButtons lang={lang} source={source} sourceId={params.id}
                    title={item.title} price={item.price} currency={item.currency}
                    url={item.url} images={images} sellerName={item.sellerName} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// 제목 앞 키워드 몇 개로 같은 마켓 검색 — 괄호·기호 제거. ponytail: 카테고리 기반 추천은 검색 로그 쌓이면
function similarQuery(title: string): string {
  return title.replace(/[【】\[\]()（）★☆◆■●※!！?？"'「」『』]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
}

async function Similar({ source, id, title, rate, viewerCurrency, lang }: {
  source: MarketSource; id: string; title: string; rate: number; viewerCurrency: "KRW" | "JPY"; lang: Lang;
}) {
  const q = similarQuery(title);
  const items = q ? (await searchSource(source, q)).filter((i) => i.sourceId !== id && !i.soldOut).slice(0, 8) : [];
  if (items.length === 0) return <p className="text-[13px] text-ink-soft">{t(lang, "ext.similarNone")}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <li key={it.sourceId}><ExternalItemCard item={it} rate={rate} viewerCurrency={viewerCurrency} lang={lang} /></li>
      ))}
    </ul>
  );
}

function SimilarSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i}><div className="skeleton aspect-square rounded-thumb" /><div className="skeleton mt-2 h-3 w-4/5 rounded" /><div className="skeleton mt-1.5 h-4 w-1/2 rounded" /></div>
      ))}
    </div>
  );
}
