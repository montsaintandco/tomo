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

  return (
    <main className="mx-auto max-w-md pb-24">
      <div className="grid grid-cols-1 gap-1">
        {(l.images as string[]).map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" className="aspect-square w-full object-cover" />
        ))}
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between rounded-card border bg-white p-3">
          <div>
            <p className="font-bold">{seller.nickname}</p>
            <p className="text-xs text-gray-400">{seller.region}</p>
          </div>
          <span className="rounded-full bg-tomo-coral px-3 py-1 text-sm font-bold text-white">
            ♥ {Number(seller.trust_temp).toFixed(1)}°
          </span>
        </div>
        <OriginalToggle
          translatedTitle={t?.title ?? l.title}
          translatedDesc={t?.description ?? l.description}
          originalTitle={l.title}
          originalDesc={l.description}
          needsTranslation={needsTranslation}
          hasTranslation={!needsTranslation || !!t}
        />
        <p className="text-xl font-bold text-tomo-navy">
          {formatWithConversion(l.price, l.currency, foreign ? viewer.rate : 1, viewer.currency)}
        </p>
        {foreign && (
          <p className="rounded-card bg-tomo-ivory p-3 text-xs text-gray-500">
            해외 상품 — {l.country === "JP" ? "나리타 센터" : "서울 센터"} 경유 배송 · 국제배송비 별도
          </p>
        )}
        {viewer.guest && l.status === "active" && (
          <Link href={`/login?next=/listings/${l.id}`}
            className="rounded-full bg-tomo-coral py-3 text-center font-bold text-white">
            로그인하고 거래하기 · ログインして取引
          </Link>
        )}
        {!viewer.guest && viewer.id !== seller.id && l.status === "active" && (
          <div className="flex gap-2">
            <ChatButton listingId={l.id} />
            <CheckoutButton listingId={l.id} />
          </div>
        )}
      </div>
    </main>
  );
}
