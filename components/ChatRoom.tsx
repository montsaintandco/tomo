"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

export type ChatMessage = {
  id: string; conversation_id: string; sender_id: string;
  body: string; body_translated: string | null;
  source_language: "ko" | "ja"; created_at: string;
};

function Bubble({ m, mine, viewerLanguage }: {
  m: ChatMessage; mine: boolean; viewerLanguage: Lang;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const foreign = m.source_language !== viewerLanguage;
  const showingTranslation = foreign && !!m.body_translated && !showOriginal;
  const text = showingTranslation ? m.body_translated! : m.body;
  // 발화 언어가 색을 정한다 — 블루=한국어, 핑크=일본어 (나라 색의 유일한 채팅 표면)
  const tone = m.source_language === "ko" ? "bg-tomo-blue/40" : "bg-tomo-pink/45";
  const accent = m.source_language === "ko" ? "text-tomo-navy" : "text-tomo-rose";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-theirs"} max-w-[78%] px-3.5 py-2.5 text-sm ${tone}`}>
        <p lang={showingTranslation ? viewerLanguage : m.source_language}
          className="whitespace-pre-wrap break-words leading-relaxed text-ink">{text}</p>
        {foreign && m.body_translated && (
          <button type="button" aria-pressed={showOriginal}
            className={`press mt-1 text-[11px] font-bold underline underline-offset-2 ${accent}`}
            onClick={() => setShowOriginal(!showOriginal)}>
            {showOriginal ? t(viewerLanguage, "detail.viewTranslation") : t(viewerLanguage, "detail.viewOriginal")}
          </button>
        )}
        {foreign && !m.body_translated && (
          <p className={`mt-1 text-[11px] ${accent} opacity-80`}>{t(viewerLanguage, "detail.translationPending")}</p>
        )}
      </div>
    </div>
  );
}

export default function ChatRoom(props: {
  conversationId: string; viewerId: string; viewerLanguage: Lang;
  initialMessages: ChatMessage[];
}) {
  const lang = props.viewerLanguage;
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`messages:${props.conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${props.conversationId}`,
      }, (payload) => {
        const m = payload.new as ChatMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [props.conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: props.conversationId, body: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessages((prev) =>
        prev.some((x) => x.id === json.message.id) ? prev : [...prev, json.message]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "chat.sendFail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} mine={m.sender_id === props.viewerId} viewerLanguage={lang} />
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p role="alert" className="px-4 pb-1 text-xs text-tomo-rose">{error}</p>}
      <form onSubmit={send} className="flex items-center gap-2 border-t border-tomo-navy/5 bg-white p-3 pb-20 md:pb-3">
        <label htmlFor="chat-draft" className="sr-only">{t(lang, "chat.placeholder")}</label>
        {/* 16px 입력 — iOS 포커스 확대 방지 */}
        <input id="chat-draft" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={t(lang, "chat.placeholder")} maxLength={1000} autoComplete="off" enterKeyHint="send"
          className="flex-1 rounded-full bg-tomo-ivory px-4 py-2.5 text-base placeholder:text-ink-soft" />
        <button disabled={busy || !draft.trim()} aria-label={t(lang, "chat.send")}
          className="btn flex h-11 w-11 shrink-0 items-center justify-center bg-tomo-coral-deep text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1}
            strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <path d="M12 19V6M6 11.5 12 5.5l6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}
