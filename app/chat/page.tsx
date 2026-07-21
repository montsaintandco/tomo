import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import Link from "next/link";
import { redirect } from "next/navigation";

type LastMessage = {
  body: string; body_translated: string | null;
  source_language: string; created_at: string;
};
type ConvoRow = {
  id: string; buyer_id: string; seller_id: string; created_at: string;
  listings: {
    id: string; title: string; source_language: string; images: string[];
    listing_translations: { language: string; title: string }[];
  };
  buyer: { nickname: string };
  seller: { nickname: string };
  messages: LastMessage[];
};

function preview(m: LastMessage | undefined, viewerLanguage: string): string {
  if (!m) return "대화를 시작해 보세요 · 会話を始めましょう";
  if (m.source_language === viewerLanguage) return m.body;
  return m.body_translated ?? m.body;
}

export default async function ChatListPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");

  const { data } = await supabase.from("conversations")
    .select(`id, buyer_id, seller_id, created_at,
      listings(id, title, source_language, images, listing_translations(language, title)),
      buyer:profiles!conversations_buyer_id_fkey(nickname),
      seller:profiles!conversations_seller_id_fkey(nickname),
      messages(body, body_translated, source_language, created_at)`)
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .limit(50);

  const convos = (data ?? []) as unknown as ConvoRow[];
  const sorted = convos.slice().sort((a, b) => {
    const at = a.messages[0]?.created_at ?? a.created_at;
    const bt = b.messages[0]?.created_at ?? b.created_at;
    return bt.localeCompare(at);
  });

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <h1 className="mb-4 text-xl font-bold text-tomo-navy">채팅 · チャット</h1>
      <div className="flex flex-col gap-2">
        {sorted.map((c) => {
          const other = c.buyer_id === viewer.id ? c.seller : c.buyer;
          const l = c.listings;
          const last = c.messages[0];
          return (
            <Link key={c.id} href={`/chat/${c.id}`}
              className="flex items-center gap-3 rounded-card border bg-white p-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-card bg-gray-100">
                {l.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-bold">{other.nickname}</p>
                  {last && (
                    <p className="shrink-0 text-[10px] text-gray-400">
                      {new Date(last.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <p className="truncate text-xs text-gray-500">{preview(last, viewer.language)}</p>
                <p className="truncate text-[10px] text-gray-400">{displayTitle(l, viewer.language)}</p>
              </div>
            </Link>
          );
        })}
      </div>
      {sorted.length === 0 && (
        <p className="mt-16 text-center text-sm text-gray-400">
          아직 채팅이 없어요 · まだチャットがありません
        </p>
      )}
    </main>
  );
}
