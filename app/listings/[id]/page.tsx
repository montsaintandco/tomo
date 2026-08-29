import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { formatWithConversion } from "@/lib/currency";
import OriginalToggle from "@/components/OriginalToggle";
import ChatButton from "@/components/ChatButton";
import CheckoutButton from "@/components/CheckoutButton";
import { CountryChip, TomoSymbol } from "@/components/Brand";
import HeartGauge from "@/components/HeartGauge";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ListingDetail({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewerOrGuest(supabase);

  const { data: l } = await supabase.from("listings")
    .select("*, listing_translations(language, title, description), profiles!listings_seller_id_fkey(id, nickname, trust_temp, region, country)")
    .eq("id", params.id).maybeSingle();
  if (!l) notFound();

  const needsTranslation = l.source_language !== viewer.language;
  const t = l.listing_translations.find((x: { language: string }) => x.language === viewer.language);
  const foreign = l.country !== viewer.country;
  const seller = l.profiles;
  const images = (l.images as string[]) ?? [];
  const canAct = l.status === "active";
  const isMine = !viewer.guest && viewer.id === seller.id;

  return (
    <main className="mx-auto max-w-md pb-32 md:grid md:max-w-5xl md:grid-cols-2 md:items-start md:gap-10 md:px-6 md:pb-16 md:pt-8">
      {/* 이미지 위 뒤로가기 — 상세는 이미지가 헤더다. 데스크톱은 좌측 고정 컬럼 */}
      <div className="relative md:sticky md:top-24 md:overflow-hidden md:rounded-card md:shadow-soft">
        <Link href="/" aria-label="피드로 돌아가기"
          className="press absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-tomo-navy/45 backdrop-blur-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>

        {/* 이미지: 가로 스와이프 (세로 나열 대신). 이미지가 없거나 깨져도 브랜드 필드가 받친다 */}
        {images.length > 0 ? (
          <div className="relative bg-tomo-navy/5">
            <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
              <TomoSymbol className="h-20 w-28 opacity-50" />
            </div>
            <div className="relative flex snap-x snap-mandatory gap-1 overflow-x-auto">
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`${l.title} 사진 ${i + 1}`}
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
            사진 {images.length}장
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 p-4 md:p-0">
        <Link href={`/profile/${seller.id}`} className="card block p-3.5 md:p-5">
          <span className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tomo-blue/25 font-brand text-sm text-tomo-navy">
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
            <span className="tnum flex items-center gap-1 rounded-full bg-tomo-pink/25 px-3 py-1 text-sm font-bold text-tomo-rose md:hidden">
              <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
                <path d="M12 21C7.2 17.2 2.5 13.6 2.5 8.9 2.5 5.6 5 3.5 7.8 3.5c1.7 0 3.3.9 4.2 2.3.9-1.4 2.5-2.3 4.2-2.3 2.8 0 5.3 2.1 5.3 5.4 0 4.7-4.7 8.3-9.5 12.1z" fill="#A34543" />
              </svg>
              {Number(seller.trust_temp).toFixed(1)}°
            </span>
          </span>
          {/* 데스크톱은 신뢰온도를 하트 게이지 풀 스케일로 (모바일은 컴팩트 필) */}
          <div className="mt-4 hidden md:block">
            <HeartGauge temp={Number(seller.trust_temp)} />
          </div>
        </Link>

        <OriginalToggle
          translatedTitle={t?.title ?? l.title}
          translatedDesc={t?.description ?? l.description}
          originalTitle={l.title}
          originalDesc={l.description}
          needsTranslation={needsTranslation}
          hasTranslation={!needsTranslation || !!t}
        />

        <div>
          <p className="tnum font-brand text-[26px] leading-tight text-ink">
            {formatWithConversion(l.price, l.currency, foreign ? viewer.rate : 1, viewer.currency)}
          </p>
        </div>

        {/* 크로스보더 안내 — 두 나라가 만나는 정보이므로 말풍선 그라데이션 */}
        {foreign && (l.trade_method === "direct" || l.trade_method === "both") && (
          <div className="grad-bridge-soft chat-bubble chat-bubble-theirs p-3.5 text-xs leading-relaxed text-ink">
            <span className="font-bold text-tomo-navy">여행 중 직거래 가능.</span>{" "}
            {l.country === "JP" ? "일본" : "한국"} 여행 때 판매자와 직접 만나 받을 수 있어요.
            채팅으로 장소·시간을 정하세요.
          </div>
        )}
        {foreign && l.trade_method !== "direct" && (
          <div className="chat-bubble chat-bubble-theirs bg-tomo-blue/20 p-3.5 text-xs leading-relaxed text-ink">
            <span className="font-bold text-tomo-navy">해외 상품이에요.</span>{" "}
            {l.country === "JP" ? "나리타" : "서울"} 센터를 거쳐 배송되고,
            국제배송비는 결제할 때 함께 계산됩니다.
          </div>
        )}

        {!canAct && (
          <p className="rounded-card bg-tomo-navy/5 p-3 text-center text-sm font-bold text-ink-soft">
            {l.status === "sold" ? "거래가 끝난 상품이에요" : "예약 중인 상품이에요"}
          </p>
        )}
        {/* CTA — 모바일은 하단 고정 바, 데스크톱은 정보 컬럼 안에서 흐름 배치 */}
        {canAct && !isMine && (
          <div className="fixed bottom-[62px] left-0 right-0 z-20 mx-auto max-w-md border-t border-tomo-navy/5 bg-white/95 p-3 backdrop-blur md:static md:mx-0 md:mt-2 md:max-w-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
          {viewer.guest ? (
            <Link href={`/login?next=/listings/${l.id}`}
              className="btn block bg-tomo-coral-deep py-3 text-center text-white">
              로그인하고 거래하기
            </Link>
          ) : (
            <div className="flex gap-2">
              <ChatButton listingId={l.id} />
              <CheckoutButton listingId={l.id} />
            </div>
          )}
          </div>
        )}
      </div>
    </main>
  );
}
