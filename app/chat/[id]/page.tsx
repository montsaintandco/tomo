import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatWithConversion, type Currency } from "@/lib/currency";
import ChatRoom, { type ChatMessage } from "@/components/ChatRoom";
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

export default async function ChatDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");

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
  const foreign = l.country !== viewer.country;

  const { data: messages } = await supabase.from("messages")
    .select("*").eq("conversation_id", convo.id)
    .order("created_at", { ascending: true }).limit(100);

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col">
      <header className="border-b bg-white p-3">
        <p className="font-bold">{other.nickname}</p>
        <Link href={`/listings/${l.id}`}
          className="mt-2 flex items-center gap-2 rounded-card bg-tomo-ivory p-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-card bg-tomo-navy/5">
            {l.images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs">{displayTitle(l, viewer.language)}</p>
            <p className="text-xs font-bold text-tomo-navy">
              {formatWithConversion(l.price, l.currency, foreign ? viewer.rate : 1, viewer.currency)}
            </p>
          </div>
        </Link>
      </header>
      <ChatRoom conversationId={convo.id} viewerId={viewer.id}
        viewerLanguage={viewer.language} initialMessages={(messages ?? []) as ChatMessage[]} />
    </main>
  );
}
