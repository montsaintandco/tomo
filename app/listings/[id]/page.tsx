import { createServerSupabase } from "@/lib/supabase/server";
import { getViewerOrGuest } from "@/lib/listings";
import { formatWithConversion } from "@/lib/currency";
import OriginalToggle from "@/components/OriginalToggle";
import ChatButton from "@/components/ChatButton";
import CheckoutButton from "@/components/CheckoutButton";
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
    <main className="mx-auto max-w-md pb-32">
      {/* 이미지: 가로 스와이프 (세로 나열 대신) */}
      {images.length > 0 ? (
        <div className="flex snap-x snap-mandatory gap-1 overflow-x-auto">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`${l.title} 사진 ${i + 1}`}
              className="aspect-square w-full shrink-0 snap-center object-cover" />
          ))}
        </div>
      ) : (
        <div className="skeleton aspect-square w-full" />
      )}

      <div className="flex flex-col gap-4 p-4">
        <Link href={`/profile/${seller.id}`}
          className="card flex items-center justify-between p-3">
          <span>
            <span className="block text-sm font-bold">{seller.nickname}</span>
            <span className="block text-xs text-gray-400">{seller.region}</span>
          </span>
          <span className="tnum rounded-full bg-tomo-coral/15 px-3 py-1 text-sm font-bold text-tomo-coral">
            ♥ {Number(seller.trust_temp).toFixed(1)}°
          </span>
        </Link>

        <OriginalToggle
          translatedTitle={t?.title ?? l.title}
          translatedDesc={t?.description ?? l.description}
          originalTitle={l.title}
          originalDesc={l.description}
          needsTranslation={needsTranslation}
          hasTranslation={!needsTranslation || !!t}
        />

        <p className="tnum text-2xl font-bold text-gray-900">
          {formatWithConversion(l.price, l.currency, foreign ? viewer.rate : 1, viewer.currency)}
        </p>

        {foreign && (l.trade_method === "direct" || l.trade_method === "both") && (
          <p className="rounded-xl bg-tomo-blue/20 p-3 text-xs leading-relaxed text-gray-700">
            <span className="font-bold text-tomo-navy">여행 중 직거래 가능</span> —{" "}
            {l.country === "JP" ? "일본" : "한국"} 여행 때 판매자와 직접 만나 받을 수 있어요.
            채팅으로 장소·시간을 정하세요.
          </p>
        )}
        {foreign && l.trade_method !== "direct" && (
          <p className="rounded-xl bg-tomo-blue/15 p-3 text-xs leading-relaxed text-gray-600">
            해외 상품이에요. {l.country === "JP" ? "나리타" : "서울"} 센터를 거쳐 배송되고,
            국제배송비는 결제할 때 함께 계산됩니다.
          </p>
        )}

        {!canAct && (
          <p className="rounded-xl bg-gray-100 p-3 text-center text-sm font-bold text-gray-500">
            {l.status === "sold" ? "거래가 끝난 상품이에요" : "예약 중인 상품이에요"}
          </p>
        )}
      </div>

      {/* 고정 CTA 바 — 스크롤과 무관하게 항상 잡힘 */}
      {canAct && !isMine && (
        <div className="fixed bottom-[62px] left-0 right-0 z-20 mx-auto max-w-md border-t border-black/5 bg-white/95 p-3 backdrop-blur">
          {viewer.guest ? (
            <Link href={`/login?next=/listings/${l.id}`}
              className="btn block bg-tomo-coral py-3 text-center text-white">
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
    </main>
  );
}
