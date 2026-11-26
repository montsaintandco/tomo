import type { Metadata } from "next";
import TrackView from "@/components/home/TrackView";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getViewerOrGuest } from "@/lib/listings";
import { formatPrice, convertPrice } from "@/lib/currency";
import PreorderCheck from "@/components/PreorderCheck";
import { loadItem } from "@/lib/market/item";
import { SOURCE_LABEL, LIVE_SOURCES, SOURCE_CURRENCY, type MarketSource, type MarketItemDetail } from "@/lib/market/types";
import { t, type Lang, type I18nKey } from "@/lib/i18n";
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
import SourceLogo from "@/components/SourceLogo";
import OriginalToggle from "@/components/OriginalToggle";
import { translateTexts } from "@/lib/translate";
import { unstable_cache } from "next/cache";
import { withTranslatedTitles } from "@/lib/market/translate-items";
import PolicyNote from "@/components/PolicyNote";
import { langAlternates } from "@/lib/seo";
import { getRequestLang } from "@/lib/locale";
import { jsonLd } from "@/lib/json-ld";
import { SITE_URL } from "@/lib/site";
import { GLOSSARY_VERSION } from "@/lib/goods-glossary";
import { translateProductTitle } from "@/lib/product-title";
import { ruleFlags, unbuyableKind, sellerCancelCount, SELLER_CANCEL_DAYS, SELLER_CANCEL_WARN_MIN, type CancelRow } from "@/lib/item-insight";
import { proxyDetailTotal } from "@/components/detail/total";
import { ProxyTotalBox } from "@/components/detail/TotalBox";
import ItemInsight from "@/components/detail/ItemInsight";
import EndedRescue from "@/components/detail/EndedRescue";
import ExternalWishButton from "@/components/search/ExternalWishButton";
import { wishedKeys } from "@/components/search/wish-server";

// 파서가 원문 키로 주는 부가정보 라벨 → 화면 언어 키. 모르는 키는 원문 그대로 보인다
const EXTRA_LABEL: Record<string, I18nKey> = {
  "배송부담": "detail.extra.shipPayer", "配送料の負担": "detail.extra.shipPayer",
  "발송지": "detail.extra.shipFrom", "発送元": "detail.extra.shipFrom",
  "발송까지": "detail.extra.shipDays", "発送まで": "detail.extra.shipDays",
  "配送方法": "detail.extra.shipMethod", "ブランド": "detail.extra.brand",
};
export const dynamic = "force-dynamic";

// 외부 마켓 스크랩 콘텐츠 — 색인 안 함(가격·품절은 진입 시점 확인). hreflang 은 언어 변형을 묶어만 둔다(01#13)
export async function generateMetadata(props: { params: Promise<{ source: string; id: string }> }): Promise<Metadata> {
  const { source, id } = await props.params;
  return { robots: { index: false, follow: true }, alternates: langAlternates(`/global/${source}/${id}`, await getRequestLang()) };
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

// 원칙 2 "번역은 투명하게": 제목·설명·상태를 뷰어 언어로 한 번에 번역하고 1h 캐시. 실패하면 null → 원문 + "번역 준비 중"
// 제목은 따로 용어집(보호→번역→복원, 03#8)을 거친다 — 용어를 바꾸면 GLOSSARY_VERSION 이 캐시 키를 바꾼다
function translateExternal(source: MarketSource, id: string, to: Lang, texts: string[]) {
  return unstable_cache(async () => {
    const from: Lang = to === "ko" ? "ja" : "ko";
    const [title, ...rest] = texts;
    const idx = rest.map((x, i) => (x.trim() ? i : -1)).filter((i) => i >= 0);
    const [trTitle, out] = await Promise.all([
      translateProductTitle(title, from, to),
      idx.length ? translateTexts(idx.map((i) => rest[i]), from, to) : Promise.resolve([] as string[]),
    ]);
    if (!out || trTitle == null) return null;
    const res = rest.slice();
    idx.forEach((i, k) => { res[i] = out[k]; });
    return [trTitle, ...res];
  }, ["ext-tr", "v4", GLOSSARY_VERSION, source, id, to], { revalidate: 3600 })().catch(() => null);
}

// 판매자 취소 이력(02#11) — 같은 마켓·같은 판매자 이름으로 최근 취소된 대행 신청 중 「판매자 취소」 사유만 센다.
// 남의 주문을 읽으므로 서버 전용 service_role. 실패하면 0(경고 안 함). 경고일 뿐 구매를 막지 않는다
async function sellerCancels(source: MarketSource, sellerName: string): Promise<number> {
  if (!sellerName.trim()) return 0;
  try {
    const since = new Date(Date.now() - SELLER_CANCEL_DAYS * 86400_000).toISOString();
    const { data, error } = await createAdminSupabase().from("proxy_requests")
      .select("external_item_id, cancel_reason, external_items!inner(source, seller_name)")
      .eq("status", "cancelled").gte("updated_at", since).not("cancel_reason", "is", null)
      .eq("external_items.source", source).eq("external_items.seller_name", sellerName).limit(100);
    if (error || !data) return 0;
    const n = sellerCancelCount(data as unknown as CancelRow[]);
    return n >= SELLER_CANCEL_WARN_MIN ? n : 0;
  } catch {
    return 0;
  }
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

  // 라이브 파싱과 캐시 조회를 동시에 — 캐시는 파서 실패·한국 소스 어드민 등록분 폴백
  const [live, { data: cached }] = await Promise.all([
    LIVE_SOURCES.includes(source) ? loadItem(source, params.id) : Promise.resolve(null),
    supabase.from("external_items").select("*").eq("source", source).eq("source_id", params.id).maybeSingle(),
  ]);
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
    ? formatPrice(convertPrice(item.price, item.currency, viewer.rate), viewer.currency, lang)
    : formatPrice(item.price, item.currency, lang);
  // 살 수 없는 출품(T2 unbuyable: 専用·주문 페이지·입찰형 경매) — 구매·대행 버튼을 막고 사유를 보인다
  const blocked = unbuyableKind(item);
  // 예상 합계 — 주문서와 같은 함수(proxyOrderTotal). 이 상품만 주문할 때의 금액
  const totals = proxyDetailTotal(item, viewer.currency, viewer.rate);
  const buyable = foreign && !item.soldOut && !blocked;
  const sourceLang: Lang = SOURCE_CURRENCY[source] === "JPY" ? "ja" : "ko";
  const sourceCountry = SOURCE_CURRENCY[source] === "JPY" ? "JP" : "KR";
  const needsTranslation = !!live && sourceLang !== lang; // 캐시 폴백은 title_translated를 이미 쓴다
  const seen = new Set<string>([params.id, `${item.title}|${item.price}`]); // 당근은 URL id와 내부 id가 달라 제목·가격으로도 거른다
  const sellerRaw = (item.sellerItems ?? []).filter((it) => { const k = it.sourceId; if (seen.has(k) || seen.has(`${it.title}|${it.price}`)) return false; seen.add(k); seen.add(`${it.title}|${it.price}`); return true; }); // 현재 상품·중복 제거
  // 본문 번역·판매자 상품 제목 번역·판매자 취소 이력·찜 여부(비로그인은 조회 안 함)는 서로 독립 — 동시에
  const [tr, sellerItems, cancels, wishedSet] = await Promise.all([
    needsTranslation ? translateExternal(source, params.id, lang, [item.title, item.description, item.condition, item.category ?? "", ...(item.tradeTags ?? []), ...Object.values(item.extra)]) : Promise.resolve(null),
    sellerRaw.length ? withTranslatedTitles(sellerRaw, lang) : Promise.resolve([] as typeof sellerRaw),
    foreign && !item.soldOut ? sellerCancels(source, item.sellerName) : Promise.resolve(0),
    wishedKeys(supabase, viewer.id, [{ source, sourceId: params.id }]),
  ]);
  const category = tr?.[3] || item.category;
  const tradeTags = item.tradeTags?.map((tag, i) => tr?.[4 + i] || tag);
  const extraBase = 4 + (item.tradeTags?.length ?? 0);
  const extra = Object.entries(item.extra).map(([k, v], i) => [k, tr?.[extraBase + i] || v] as const);
  const flags = foreign ? ruleFlags(item) : [];
  const shipExtra = extra.find(([k]) => /발송지|発送元/.test(k))?.[1]; // 메루카리는 extra 「발송지」(都道府県)에 준다
  const shipFrom = item.shipFrom || item.region || shipExtra;
  const shipFromLang = !item.shipFrom && !item.region && shipExtra && tr ? lang : sourceLang;
  const shownTitle = tr?.[0] ?? item.title;
  const path = `/global/${source}/${params.id}`;

  // 첫 화면 사실 표(04T6) — 상태·판매자(평가·거래 수)·발송지. 원본 마켓 값 그대로
  const facts: [string, React.ReactNode][] = [
    ...(item.condition ? [[t(lang, "ext.condition"), <span key="c" lang={tr?.[2] ? lang : sourceLang}>{tr?.[2] || item.condition}</span>] as [string, React.ReactNode]] : []),
    ...(item.sellerName || item.sellerRating || item.sellerSales != null ? [[t(lang, "ext.seller"), (
      <span key="s" className="flex flex-wrap items-center gap-x-1.5">
        <span lang={sourceLang}>{item.sellerName || t(lang, "ext.seller")}</span>
        {item.sellerRating && <span className="tnum font-normal text-ink-soft">{t(lang, "ext.sellerRating")} {item.sellerRating}</span>}
        {item.sellerSales != null && <span className="tnum font-normal text-ink-soft">{t(lang, "detail.sellerSales", { n: item.sellerSales })}</span>}
      </span>
    )] as [string, React.ReactNode]] : []),
    ...(item.sellerTemp != null ? [[t(lang, "ext.sellerTemp"), <span key="t" className="tnum">{item.sellerTemp.toFixed(1)}°</span>] as [string, React.ReactNode]] : []),
    [t(lang, "detail.shipFrom"), <span key="f" className="inline-flex items-center gap-1.5"><CountryChip country={sourceCountry} />{shipFrom && <span lang={shipFromLang}>{shipFrom}</span>}</span>],
  ];

  const similar = (
    <Suspense fallback={<SimilarSkeleton />}>
      <Similar source={source} id={params.id} title={item.title} rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} />
    </Suspense>
  );

  return (
    <main className="mx-auto max-w-md pb-24 standalone:pb-28 md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-8">
      <TrackView item={{ href: `/global/${source}/${params.id}`, title: shownTitle, thumb: images[0] ?? "", price: item.price, currency: item.currency }} />
      {/* 이동 경로 구조화 데이터(01#13) — 홈 › 해외직구 › 상품 */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: t(lang, "nav.home"), item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: t(lang, "nav.global"), item: `${SITE_URL}/global` },
          { "@type": "ListItem", position: 3, name: shownTitle, item: `${SITE_URL}${path}` },
        ],
      }) }} />
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
            prevLabel={t(lang, "ext.prevPhoto")} nextLabel={t(lang, "ext.nextPhoto")} zoomLabel={t(lang, "detail.zoom")} closeLabel={t(lang, "detail.close")} />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-tomo-navy/5">
            <TomoSymbol className="h-20 w-28 opacity-60" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 p-4 md:p-0">
        {/* 뱃지 행 — 소스는 네이비, 경매는 코랄딥(행동 신호), 품절은 스크림 톤 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-tomo-navy/10 bg-white py-0.5 pl-1 pr-2.5 text-[11px] font-bold text-ink">
            <SourceLogo source={source} lang={lang} size={16} />{t(lang, `source.${source}`)}
          </span>
          {item.auction && (
            <span className="rounded-full bg-tomo-coral-deep px-2.5 py-1 text-[11px] font-bold text-white">{t(lang, "badge.auction")}</span>
          )}
          {item.soldOut && (
            <span className="rounded-full bg-tomo-navy/70 px-2.5 py-1 text-[11px] font-bold text-white">{t(lang, "badge.soldOut")}</span>
          )}
          {/* 해외 상품 찜(0038) — 찜할 때 화면 제목·가격·첫 사진을 스냅샷으로 남긴다 */}
          <ExternalWishButton className="ml-auto" lang={lang} guest={!!viewer.guest} initialWished={wishedSet.size > 0}
            item={{ source, sourceId: params.id, title: shownTitle, price: item.price, currency: item.currency, thumb: images[0] ?? "" }} />
        </div>

        {/* 품절 구제(02#14) — 비활성 버튼만 두지 않고 다음 행동(다시 찾기·비슷한 상품)을 맨 위에 */}
        {item.soldOut && (
          <EndedRescue lang={lang} source={source} query={similarQuery(item.title)}>{similar}</EndedRescue>
        )}

        <OriginalToggle lang={lang} originalLang={sourceLang} needsTranslation={needsTranslation} hasTranslation={!!tr}
          originalTitle={item.title} originalDesc={item.description || t(lang, "ext.noDescription")}
          translatedTitle={shownTitle} translatedDesc={tr?.[1] || item.description || t(lang, "ext.noDescription")}
          between={<div className="mt-4 flex flex-col gap-4">
        {/* 원본 맥락 한 줄 — 카테고리 · 게시 시각 · 조회/관심/채팅 (당근·메루카리가 보여주는 것을 그대로) */}
        {(item.category || item.postedAt || item.counts) && (
          <p className="-mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-soft">
            {category && <span lang={tr?.[3] ? lang : sourceLang}>{category}</span>}
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
        {tradeTags && tradeTags.length > 0 && (
          <div className="-mt-2 flex flex-wrap gap-1">
            {tradeTags.map((tag) => (
              <span key={tag} lang={tr ? lang : sourceLang} className="rounded-full bg-tomo-navy/5 px-2 py-0.5 text-[11px] font-bold text-tomo-navy">{tag}</span>
            ))}
          </div>
        )}

        <div>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="tnum text-[17px] font-extrabold leading-tight text-ink">{buyerPrice}</span>
            {foreign && <span className="tnum text-[14px] font-bold text-ink-soft">{formatPrice(item.price, item.currency, lang)}</span>}
          </p>
          {item.auction && <p className="mt-1 text-[12px] text-ink-soft">{t(lang, "ext.auctionNote")}</p>}
        </div>

        {/* 상태·판매자·발송지 — 가격 바로 아래(04T6) */}
        <dl className="divide-y divide-tomo-navy/5 text-[13px]">
          {facts.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 py-2">
              <dt className="text-ink-soft">{k}</dt>
              <dd className="min-w-0 font-bold text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <ItemInsight lang={lang} codes={flags} sellerCancels={cancels} />

        {/* 예상 합계(04T5) — 주문서와 같은 함수 값. 배송 예상 → 합계 → 주문 전 확인 */}
        {buyable && (
          <>
            <div className="flex gap-3 text-[13px]">
              <span className="w-10 shrink-0 font-bold text-ink-soft">{t(lang, "ext.delivery")}</span>
              <div>
                <p className="font-bold text-ink">{t(lang, "ext.deliveryEta")}</p>
                <ul className="mt-1 text-[12px] text-ink-soft">
                  <li>◉ {t(lang, "ext.stage1")}</li>
                  <li>○ {t(lang, "ext.stage2")}</li>
                </ul>
              </div>
            </div>
            <ProxyTotalBox lang={lang} totals={totals} original={formatPrice(item.price, item.currency, lang)} shippingIncluded={item.shippingIncluded} />
            <PreorderCheck lang={lang} />
          </>
        )}
        {/* CTA — 모바일은 하단 고정 바(DOM 위치 무관). 데스크톱은 가격·배송·총액 바로 아래 흐름 배치 */}
        <div className="fixed bottom-0 standalone:bottom-[62px] left-0 right-0 z-20 mx-auto max-w-md border-t border-tomo-navy/5 bg-white/95 p-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:max-w-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
          {!foreign ? (
            <div className="flex items-center gap-3 rounded-card bg-tomo-navy/5 p-3 text-[12px] text-ink-soft md:bg-transparent md:p-0">
              {/* 같은 나라 상품: TOMO가 더해줄 게 없다 — 참고용 페이지. 떠나보내는 버튼을 크게 만들지 않는다 */}
              <p className="min-w-0 flex-1">{t(lang, "ext.domesticNote")}</p>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn shrink-0 border border-tomo-navy/15 bg-white px-3 py-2 text-[13px] text-ink">
                {t(lang, "ext.openDirect")} ↗
              </a>
            </div>
          ) : item.soldOut ? (
            <button disabled className="btn w-full bg-tomo-navy/70 py-3 text-sm text-white">{t(lang, "ext.soldOutCta")}</button>
          ) : blocked ? (
            <div>
              <button disabled className="btn w-full bg-tomo-navy/70 py-3 text-sm text-white">{t(lang, `detail.unbuyable.${blocked}`)}</button>
              {blocked === "buyer_only" && item.unbuyable && (
                <p className="mt-1 text-center text-[11px] text-ink-soft" lang={sourceLang}>{t(lang, "detail.unbuyableReason", { r: item.unbuyable })}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 shrink-0 md:hidden">{/* 데스크톱은 바로 위 합계 박스가 있다 */}
                <p className="text-[11px] font-bold text-ink-soft">{t(lang, "detail.totalShort")}</p>
                <p className="tnum text-[15px] font-extrabold leading-tight text-ink">{formatPrice(totals.total, totals.currency, lang)}</p>
              </div>
              <div className="min-w-0 flex-1">
                {viewer.guest ? (
                  <Link href={`/login?next=${path}`}
                    className="btn block bg-tomo-coral-deep py-3 text-center text-sm text-white">
                    {t(lang, "ext.loginCta")}
                  </Link>
                ) : item.auction ? (
                  <ProxyRequestButton lang={lang} auction totalLabel={buyerPrice}
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
          </div>} />

        {extra.some(([, v]) => v) && (
          <dl className="card grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-3.5 text-xs text-ink-soft">
            {extra.filter(([, v]) => v).map(([k, v]) => (
              <Fragment key={k}><dt className="font-bold text-ink" lang={EXTRA_LABEL[k] ? lang : sourceLang}>{EXTRA_LABEL[k] ? t(lang, EXTRA_LABEL[k]) : k}</dt><dd lang={tr ? lang : sourceLang}>{v}</dd></Fragment>
            ))}
          </dl>
        )}
        {item.sellerTemp != null && <p className="-mt-2 flex items-center gap-1 text-[11px] text-ink-soft"><CountryChip country={sourceCountry} />{t(lang, "ext.sellerTempNote")}</p>}

        {/* 판매자의 다른 상품 — 같은 마켓 카드로 */}
        {sellerItems.length > 0 && (
          <section aria-label={t(lang, "ext.sellerItems")} className="pt-1">
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "ext.sellerItems")}</h2>
            <MarketCarousel items={sellerItems} rate={viewer.rate} viewerCurrency={viewer.currency} lang={lang} label={t(lang, "ext.sellerItems")} />
          </section>
        )}

        {/* 비슷한 상품 — 같은 마켓에서 제목 키워드로 검색, 스트리밍. 품절이면 위 구제 영역에 이미 있다 */}
        {!item.soldOut && (
          <section aria-label={t(lang, "ext.similar")} className="pt-1">
            <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "ext.similar")}</h2>
            {similar}
          </section>
        )}

        {stale && (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-xs leading-relaxed text-ink-soft">{t(lang, "ext.stale")}</p>
        )}

        {foreign && <a href={item.url} target="_blank" rel="noopener noreferrer"
          className="press self-center py-2 text-xs text-ink-soft underline underline-offset-2 hover:text-ink">
          {t(lang, "ext.openOriginal")} ↗
        </a>}

        <PolicyNote lang={lang} kind="proxy" />
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
  const items = q ? await withTranslatedTitles((await searchSource(source, q)).filter((i) => i.sourceId !== id && !i.soldOut).slice(0, 8), lang) : [];
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
