import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { convertPrice, formatPrice } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import OriginalToggle from "@/components/OriginalToggle";
import ChatButton from "@/components/ChatButton";
import CheckoutButton from "@/components/CheckoutButton";
import ShareButton from "@/components/ShareButton";
import WishButton from "@/components/WishButton";
import OfferButton, { type MyOffer } from "@/components/OfferButton";
import SellerPanel, { type ReceivedOffer } from "@/components/SellerPanel";
import TrustStrip from "@/components/TrustStrip";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import HeartGauge from "@/components/HeartGauge";
import Link from "next/link";
import { notFound } from "next/navigation";

const HEART = "M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z";
const CATEGORIES = ["figure", "camera", "fashion", "kpop", "game", "vintage", "etc"] as const;
const METHODS = ["direct", "shipping", "both"] as const;

// 메루카리식 상세: 이미지 → 제목 → 큰 가격+배송 주석 → 설명 → 상품 정보 표 → 판매자 → 안심 거래 → 하단 가격+구매 바
export default async function ListingDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const lang: Lang = viewer.language;

  const { data: l } = await supabase.from("listings")
    .select("*, listing_translations(language, title, description), profiles!listings_seller_id_fkey(id, nickname, trust_temp, region, country)")
    .eq("id", params.id).maybeSingle();
  if (!l) notFound();

  const seller = l.profiles;
  const isMine = !viewer.guest && viewer.id === seller.id;

  // 카운터(당근 "관심·조회·채팅")는 공개 함수, 내 찜/제안은 본인 행 RLS, 셀러는 받은 제안. 조회수는 렌더마다 +1
  const [wishRes, chatRes, mineRes, myOfferRes, receivedRes] = await Promise.all([
    supabase.rpc("wishlist_count", { lid: l.id }),
    supabase.rpc("conversation_count", { lid: l.id }),
    viewer.guest ? Promise.resolve({ data: null })
      : supabase.from("wishlists").select("listing_id").eq("user_id", viewer.id).eq("listing_id", l.id).maybeSingle(),
    viewer.guest || isMine ? Promise.resolve({ data: null })
      : supabase.from("offers").select("id, price, status").eq("buyer_id", viewer.id).eq("listing_id", l.id).maybeSingle(),
    isMine
      ? supabase.from("offers").select("id, price, status, created_at, profiles!offers_buyer_id_fkey(nickname)")
          .eq("listing_id", l.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    isMine ? Promise.resolve(null) : supabase.rpc("increment_view", { lid: l.id }),
  ]);
  const wishCount = typeof wishRes.data === "number" ? wishRes.data : 0;
  const chatCount = typeof chatRes.data === "number" ? chatRes.data : 0;
  const wished = !!mineRes.data;
  const myOffer = (myOfferRes.data ?? null) as MyOffer;
  const receivedOffers = (receivedRes.data ?? []) as unknown as ReceivedOffer[];

  const needsTranslation = l.source_language !== lang;
  const tr = l.listing_translations.find((x: { language: string }) => x.language === lang);
  const foreign = l.country !== viewer.country;
  const images = (l.images as string[]) ?? [];
  const canAct = l.status === "active";
  const free = l.price === 0;
  const travelDeal = foreign && (l.trade_method === "direct" || l.trade_method === "both");
  const center = l.country === "JP" ? "NARITA" : "SEOUL";
  const country = l.country as "KR" | "JP";
  const category = (CATEGORIES as readonly string[]).includes(l.category) ? l.category as (typeof CATEGORIES)[number] : "etc";
  const method = (METHODS as readonly string[]).includes(l.trade_method) ? l.trade_method as (typeof METHODS)[number] : "both";

  const buyerPrice = free ? t(lang, "price.free") : foreign
    ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(l.price, l.currency, viewer.rate), viewer.currency)}`
    : formatPrice(l.price, l.currency);
  const condition = (["new", "like_new", "good", "fair", "poor"] as const).find((c) => c === l.condition) ?? "good";
  const payer = l.shipping_payer === "buyer" ? "buyer" : "seller";
  const shipDays = (["1_2", "2_3", "4_7"] as const).find((d) => d === l.ship_days) ?? "2_3";
  // 배송 주석 — 메루카리의 「送料込み」 자리. 해외 배송이면 국제배송비 안내, 아니면 거래 방법
  const methodLabel = method === "both" ? t(lang, "method.bothLong") : t(lang, `method.${method}`);
  const shipNote = foreign && method !== "direct" ? t(lang, "ship.intl") : methodLabel;
  const listedAt = new Date(l.created_at).toLocaleDateString(lang === "ja" ? "ja-JP" : "ko-KR", { year: "numeric", month: "long", day: "numeric" });

  const info: [string, React.ReactNode][] = [
    [t(lang, "info.category"), t(lang, `cat.${category}`)],
    [t(lang, "info.condition"), t(lang, `cond.${condition}`)],
    [t(lang, "info.method"), methodLabel],
    ...(method !== "direct" ? [
      [t(lang, "info.payer"), t(lang, `payer.${payer}`)] as [string, React.ReactNode],
      [t(lang, "info.days"), t(lang, `days.${shipDays}`)] as [string, React.ReactNode],
    ] : []),
    [t(lang, "info.origin"), <span key="o" className="inline-flex items-center gap-1.5"><CountryChip country={country} />{l.region}</span>],
    [t(lang, "info.crossBorder"), l.cross_border_enabled ? t(lang, "info.crossBorderYes", { center: t(lang, `center.${center}`) }) : t(lang, "info.crossBorderNo")],
    [t(lang, "info.listed"), <span key="d" className="tnum">{listedAt}</span>],
  ];

  const priceBlock = (
    <div className="mt-2">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="tnum text-[17px] font-extrabold leading-tight text-ink">{buyerPrice}</span>
        <span className="text-xs text-ink-soft">{shipNote}</span>
      </p>
      {foreign && !free && <p className="tnum mt-0.5 text-xs font-bold text-ink-soft">{formatPrice(l.price, l.currency)}</p>}
      {/* 당근식 카운터 — 관심 · 조회 · 채팅 */}
      <p className="tnum mt-1.5 text-[12px] text-ink-soft">
        {t(lang, "stat.wish", { n: wishCount })} · {t(lang, "stat.view", { n: l.view_count ?? 0 })} · {t(lang, "stat.chat", { n: chatCount })}
      </p>
    </div>
  );

  return (
    <main className="mx-auto max-w-md pb-36 md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-8">
      {/* 이미지 위 뒤로가기 — 상세는 이미지가 헤더다. 데스크톱은 좌측 고정 컬럼 */}
      <div className="relative md:sticky md:top-24 md:overflow-hidden md:rounded-card md:shadow-soft">
        <Link href="/" aria-label={t(lang, "detail.back")}
          className="press absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-tomo-navy/60 backdrop-blur-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        {/* 메루카리의 SOLD 리본 자리 — 끝난 거래는 이미지 위에서 먼저 말한다 */}
        {!canAct && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-tomo-navy/75 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm">
            {l.status === "sold" ? t(lang, "badge.sold") : t(lang, "badge.reserved")}
          </span>
        )}

        {/* 이미지: 가로 스와이프. 이미지가 없거나 깨져도 브랜드 심볼이 받친다 */}
        {images.length > 0 ? (
          <div className="relative bg-tomo-navy/5">
            <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <TomoSymbol className="h-20 w-28 opacity-50" />
            </div>
            <div className="relative flex snap-x snap-mandatory gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`${l.title} ${i + 1}`}
                  className="aspect-square w-full shrink-0 snap-center object-cover" />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center bg-tomo-navy/5">
            <TomoSymbol className="h-20 w-28 opacity-60" />
          </div>
        )}
        {images.length > 1 && (
          <span className="tnum absolute bottom-3 right-3 rounded-full bg-tomo-navy/70 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
            {t(lang, "detail.photos", { n: images.length })}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6 p-4 md:p-0">
        {/* 제목 → 가격(배송 주석) → 설명 — 한 덩어리로 읽힌다 */}
        <div>
          <OriginalToggle
            translatedTitle={tr?.title ?? l.title}
            translatedDesc={tr?.description ?? l.description}
            originalTitle={l.title}
            originalDesc={l.description}
            originalLang={l.source_language as Lang}
            needsTranslation={needsTranslation}
            hasTranslation={!needsTranslation || !!tr}
            lang={lang}
            between={priceBlock}
          />
          {/* 액션 행 — 메루카리 「いいね · 共有」 */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <WishButton listingId={l.id} initialLiked={wished} initialCount={wishCount} guest={!!viewer.guest} lang={lang} />
              <ShareButton title={tr?.title ?? l.title} lang={lang} />
            </span>
            {travelDeal && (
              <span className="grad-bridge-soft inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-tomo-navy">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden><path d={HEART} fill="#C14E4C" /></svg>
                {t(lang, "detail.travelLead")}
              </span>
            )}
          </div>
        </div>

        {/* 가격제안 — 판매자가 허용한 판매중 상품, 구매자만 */}
        {canAct && !isMine && !free && l.allow_offers && (
          <OfferButton listingId={l.id} price={l.price} currency={l.currency} initial={myOffer} guest={!!viewer.guest} lang={lang} />
        )}
        {isMine && (
          <SellerPanel listingId={l.id} currency={l.currency} bumpedAt={l.bumped_at ?? l.created_at}
            active={canAct} offers={receivedOffers} lang={lang} />
        )}

        {/* 크로스보더 안내 웰 */}
        {travelDeal && (
          <p className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
            {t(lang, "detail.travelBody", { market: t(lang, `market.${country}`) })}
          </p>
        )}
        {foreign && method !== "direct" && (
          <p className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
            <span className="font-bold text-tomo-navy">{t(lang, "detail.foreignLead")}.</span>{" "}
            {t(lang, "detail.foreignBody", { center: t(lang, `center.${center}`) })}
          </p>
        )}

        {/* 상품 정보 표 — 메루카리 「商品の情報」 */}
        <section>
          <h2 className="mb-1 text-[15px] font-extrabold text-ink">{t(lang, "detail.info")}</h2>
          <dl className="divide-y divide-tomo-navy/5">
            {info.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 py-3">
                <dt className="text-[13px] text-ink-soft">{k}</dt>
                <dd className="text-[13px] font-bold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 판매자 — 메루카리 「出品者」 */}
        <section>
          <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "detail.sellerTitle")}</h2>
          <Link href={`/profile/${seller.id}`} className="card block p-3.5 md:p-5">
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tomo-navy/5 text-sm font-bold text-tomo-navy">
                  {seller.nickname.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">{seller.nickname}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-soft">
                    <CountryChip country={seller.country} />
                    <span className="truncate">{seller.region}</span>
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tnum flex items-center gap-1 rounded-full bg-tomo-navy/5 px-2.5 py-1 text-[11px] font-bold text-tomo-navy md:hidden">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden><path d={HEART} fill="#C14E4C" /></svg>
                  {Number(seller.trust_temp).toFixed(1)}°
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-ink-faint" aria-hidden>
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </span>
            </span>
            {/* 데스크톱은 신뢰온도를 하트 게이지 풀 스케일로 (모바일은 컴팩트 필) */}
            <div className="mt-4 hidden md:block">
              <HeartGauge temp={Number(seller.trust_temp)} lang={lang} />
            </div>
          </Link>
        </section>

        {/* 안심 거래 — 메루카리 「あんしん・あんぜんへの取り組み」. 사실 세 가지만 */}
        <section>
          <h2 className="mb-2 text-[15px] font-extrabold text-ink">{t(lang, "detail.safeTitle")}</h2>
          <TrustStrip lang={lang} />
        </section>

        {!canAct && (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-sm font-bold text-ink-soft">
            {l.status === "sold" ? t(lang, "detail.sold") : t(lang, "detail.reserved")}
          </p>
        )}

        {/* 하단 바 — 메루카리식: [채팅] 가격 [구매하기]. 모바일 고정, 데스크톱은 흐름 배치 */}
        {canAct && !isMine && (
          <div className="fixed bottom-[62px] left-0 right-0 z-20 mx-auto max-w-md border-t border-tomo-navy/5 bg-white/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:max-w-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
            {viewer.guest ? (
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="tnum block truncate text-[17px] font-extrabold leading-tight text-ink">{buyerPrice}</span>
                  <span className="block truncate text-[11px] text-ink-soft">{shipNote}</span>
                </span>
                <Link href={`/login?next=/listings/${l.id}`}
                  className="btn shrink-0 bg-tomo-coral-deep px-6 py-3 text-center text-sm text-white">
                  {t(lang, "detail.loginCta")}
                </Link>
              </div>
            ) : (
              <div className="relative flex items-center gap-3">
                <ChatButton listingId={l.id} lang={lang} compact />
                <span className="min-w-0 flex-1">
                  <span className="tnum block truncate text-[17px] font-extrabold leading-tight text-ink">{buyerPrice}</span>
                  <span className="block truncate text-[11px] text-ink-soft">{shipNote}</span>
                </span>
                {!free && (
                  <div className="w-[46%] shrink-0">
                    <CheckoutButton listingId={l.id} lang={lang} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
