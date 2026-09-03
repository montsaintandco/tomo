import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { t, type Lang } from "@/lib/i18n";
import { TomoSymbol } from "@/components/Brand";
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

function preview(m: LastMessage | undefined, lang: Lang): string {
  if (!m) return t(lang, "chat.start");
  if (m.source_language === lang) return m.body;
  return m.body_translated ?? m.body;
}

// 날짜 — 뷰어 언어의 로캘로 (서버 렌더라 브라우저 로캘 대신 명시)
function when(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const sameDay = Date.now() - d.getTime() < 86_400_000;
  return d.toLocaleString(lang === "ja" ? "ja-JP" : "ko-KR",
    sameDay ? { hour: "2-digit", minute: "2-digit" } : { month: "numeric", day: "numeric" });
}

export default async function ChatListPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");
  const lang: Lang = viewer.language;

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
    <main className="mx-auto max-w-md p-4 pb-24 md:max-w-2xl md:px-6 md:pb-16 md:pt-8">
      <h1 className="mb-3 text-[17px] font-extrabold leading-tight text-ink md:text-xl">{t(lang, "chat.title")}</h1>
      <ul className="flex flex-col">
        {sorted.map((c) => {
          const other = c.buyer_id === viewer.id ? c.seller : c.buyer;
          const l = c.listings;
          const last = c.messages[0];
          return (
            <li key={c.id} className="border-b border-tomo-navy/5 last:border-0">
              <Link href={`/chat/${c.id}`} className="press flex items-center gap-3 py-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-thumb bg-tomo-navy/5">
                  {l.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <TomoSymbol className="h-6 w-9 opacity-60" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-bold text-ink">{other.nickname}</p>
                    {last && <p className="tnum shrink-0 text-[11px] text-ink-soft">{when(last.created_at, lang)}</p>}
                  </div>
                  <p className="truncate text-[13px] text-ink">{preview(last, lang)}</p>
                  <p className="truncate text-[11px] text-ink-soft">{displayTitle(l, lang)}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {sorted.length === 0 && (
        <div className="mt-14 flex flex-col items-center px-6 text-center">
          <TomoSymbol />
          <p className="mt-3 text-sm text-ink-soft">{t(lang, "chat.empty")}</p>
          <p className="mt-1 text-xs text-ink-soft">{t(lang, "chat.emptySub")}</p>
        </div>
      )}
    </main>
  );
}
