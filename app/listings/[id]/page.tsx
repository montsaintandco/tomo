import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { convertPrice, formatPrice } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import OriginalToggle from "@/components/OriginalToggle";
import ChatButton from "@/components/ChatButton";
import CheckoutButton from "@/components/CheckoutButton";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import HeartGauge from "@/components/HeartGauge";
import Link from "next/link";
import { notFound } from "next/navigation";

const HEART = "M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z";

export default async function ListingDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);
  const lang: Lang = viewer.language;

  const { data: l } = await supabase.from("listings")
    .select("*, listing_translations(language, title, description), profiles!listings_seller_id_fkey(id, nickname, trust_temp, region, country)")
    .eq("id", params.id).maybeSingle();
  if (!l) notFound();

  const needsTranslation = l.source_language !== lang;
  const tr = l.listing_translations.find((x: { language: string }) => x.language === lang);
  const foreign = l.country !== viewer.country;
  const seller = l.profiles;
  const images = (l.images as string[]) ?? [];
  const canAct = l.status === "active";
  const isMine = !viewer.guest && viewer.id === seller.id;
  const travelDeal = foreign && (l.trade_method === "direct" || l.trade_method === "both");
  const center = l.country === "JP" ? "NARITA" : "SEOUL";

  return (
    <main className="mx-auto max-w-md pb-32 md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-8">
      {/* 이미지 위 뒤로가기 — 상세는 이미지가 헤더다. 데스크톱은 좌측 고정 컬럼 */}
      <div className="relative md:sticky md:top-24 md:overflow-hidden md:rounded-card md:shadow-soft">
        <Link href="/" aria-label={t(lang, "detail.back")}
          className="press absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-tomo-navy/60 backdrop-blur-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>

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

      <div className="flex flex-col gap-4 p-4 md:p-0">
        {/* 판매자 — 아바타는 구조 틴트(네이비), 나라는 칩이 말한다 */}
        <Link href={`/profile/${seller.id}`} className="card block p-3.5 md:p-5">
          <span className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tomo-navy/5 text-sm font-bold text-tomo-navy">
                {seller.nickname.slice(0, 1)}
              </span>
              <span>
                <span className="block text-sm font-bold text-ink">{seller.nickname}</span>
                <span className="flex items-center gap-1 text-xs text-ink-soft">
                  <CountryChip country={seller.country} />
                  {seller.region}
                </span>
              </span>
            </span>
            <span className="tnum flex items-center gap-1 rounded-full bg-tomo-navy/5 px-2.5 py-1 text-[11px] font-bold text-tomo-navy md:hidden">
              <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden><path d={HEART} fill="#C14E4C" /></svg>
              {Number(seller.trust_temp).toFixed(1)}°
            </span>
          </span>
          {/* 데스크톱은 신뢰온도를 하트 게이지 풀 스케일로 (모바일은 컴팩트 필) */}
          <div className="mt-4 hidden md:block">
            <HeartGauge temp={Number(seller.trust_temp)} lang={lang} />
          </div>
        </Link>

        <OriginalToggle
          translatedTitle={tr?.title ?? l.title}
          translatedDesc={tr?.description ?? l.description}
          originalTitle={l.title}
          originalDesc={l.description}
          originalLang={l.source_language as Lang}
          needsTranslation={needsTranslation}
          hasTranslation={!needsTranslation || !!tr}
          lang={lang}
        />

        {/* 가격 — 구매자 통화가 큰 숫자, 원가는 작게 (Price-Loudest) */}
        <div>
          <p className="tnum text-[17px] font-extrabold leading-tight text-ink">
            {foreign
              ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(l.price, l.currency, viewer.rate), viewer.currency)}`
              : formatPrice(l.price, l.currency)}
          </p>
          {foreign && <p className="tnum mt-0.5 text-xs font-bold text-ink-soft">{formatPrice(l.price, l.currency)}</p>}
        </div>

        {/* 크로스보더 안내 — 구조 틴트 웰. 브리지 그라데이션은 여행 직거래 뱃지에만 */}
        {travelDeal && (
          <div className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
            <span className="grad-bridge-soft mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-tomo-navy">
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden><path d={HEART} fill="#C14E4C" /></svg>
              {t(lang, "detail.travelLead")}
            </span>
            <p>{t(lang, "detail.travelBody", { market: t(lang, `market.${l.country as "KR" | "JP"}`) })}</p>
          </div>
        )}
        {foreign && l.trade_method !== "direct" && (
          <div className="rounded-card bg-tomo-navy/5 p-3.5 text-[13px] leading-relaxed text-ink">
            <span className="font-bold text-tomo-navy">{t(lang, "detail.foreignLead")}.</span>{" "}
            {t(lang, "detail.foreignBody", { center: t(lang, `center.${center}`) })}
          </div>
        )}

        {!canAct && (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-sm font-bold text-ink-soft">
            {l.status === "sold" ? t(lang, "detail.sold") : t(lang, "detail.reserved")}
          </p>
        )}
        {/* CTA — 모바일은 하단 고정 바, 데스크톱은 정보 컬럼 안에서 흐름 배치 */}
        {canAct && !isMine && (
          <div className="fixed bottom-[62px] left-0 right-0 z-20 mx-auto max-w-md border-t border-tomo-navy/5 bg-white/95 p-3 backdrop-blur md:static md:mx-0 md:mt-2 md:max-w-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
            {viewer.guest ? (
              <Link href={`/login?next=/listings/${l.id}`}
                className="btn block bg-tomo-coral-deep py-3 text-center text-sm text-white">
                {t(lang, "detail.loginCta")}
              </Link>
            ) : (
              <div className="flex gap-2">
                <ChatButton listingId={l.id} lang={lang} />
                <CheckoutButton listingId={l.id} lang={lang} />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
