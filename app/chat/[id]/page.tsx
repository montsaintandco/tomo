import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { convertPrice, formatPrice, type Currency } from "@/lib/currency";
import { t, type Lang } from "@/lib/i18n";
import ChatRoom, { type ChatMessage } from "@/components/ChatRoom";
import { TomoSymbol } from "@/components/Brand";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type ConvoDetail = {
  id: string; buyer_id: string; seller_id: string;
  listings: {
    id: string; title: string; price: number; currency: Currency;
    source_language: string; country: "KR" | "JP"; status: string; images: string[];
    listing_translations: { language: string; title: string }[];
  };
  buyer: { id: string; nickname: string };
  seller: { id: string; nickname: string };
};

export default async function ChatDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");
  const lang: Lang = viewer.language;

  const { data } = await supabase.from("conversations")
    .select(`id, buyer_id, seller_id,
      listings(id, title, price, currency, source_language, country, status, images,
        listing_translations(language, title)),
      buyer:profiles!conversations_buyer_id_fkey(id, nickname),
      seller:profiles!conversations_seller_id_fkey(id, nickname)`)
    .eq("id", params.id).maybeSingle();
  if (!data) notFound(); // RLS: 비참여자는 여기서 차단

  const convo = data as unknown as ConvoDetail;
  const other = convo.buyer_id === viewer.id ? convo.seller : convo.buyer;
  const l = convo.listings;
  const foreign = l.currency !== viewer.currency;
  const price = foreign
    ? `${t(lang, "price.approx")} ${formatPrice(convertPrice(l.price, l.currency, viewer.rate), viewer.currency)}`
    : formatPrice(l.price, l.currency);

  const { data: messages } = await supabase.from("messages")
    .select("*").eq("conversation_id", convo.id)
    .order("created_at", { ascending: true }).limit(100);

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col md:h-[calc(100dvh-65px)] md:max-w-2xl">
      <header className="border-b border-tomo-navy/5 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Link href="/chat" aria-label={t(lang, "detail.back")}
            className="press -ml-1 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-tomo-navy/5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
              strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <p className="text-[15px] font-bold text-ink">{other.nickname}</p>
        </div>
        {/* 대화 맥락 — 상품 스트립 (구조 틴트 웰) */}
        <Link href={`/listings/${l.id}`} aria-label={t(lang, "chat.listing")}
          className="press mt-2 flex items-center gap-2.5 rounded-card bg-tomo-navy/5 p-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-thumb bg-white">
            {l.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center"><TomoSymbol className="h-5 w-8 opacity-60" /></div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink">{displayTitle(l, lang)}</p>
            <p className="tnum text-[13px] font-extrabold text-ink">
              {price}
              {l.status !== "active" && (
                <span className="ml-1.5 rounded-full bg-tomo-navy/10 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft">
                  {t(lang, l.status === "sold" ? "badge.sold" : "badge.reserved")}
                </span>
              )}
            </p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden>
            <path d="m9 5 7 7-7 7" />
          </svg>
        </Link>
      </header>
      <ChatRoom conversationId={convo.id} viewerId={viewer.id}
        viewerLanguage={lang} initialMessages={(messages ?? []) as ChatMessage[]} />
    </main>
  );
}
