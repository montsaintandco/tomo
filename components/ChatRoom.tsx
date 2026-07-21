"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";

export type ChatMessage = {
  id: string; conversation_id: string; sender_id: string;
  body: string; body_translated: string | null;
  source_language: "ko" | "ja"; created_at: string;
};

function Bubble({ m, mine, viewerLanguage }: {
  m: ChatMessage; mine: boolean; viewerLanguage: "ko" | "ja";
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const foreign = m.source_language !== viewerLanguage;
  const text = foreign && m.body_translated && !showOriginal ? m.body_translated : m.body;
  const tone = m.source_language === "ko" ? "bg-tomo-blue/40" : "bg-tomo-pink/40";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-card px-3 py-2 text-sm text-gray-800 ${tone}`}>
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {foreign && m.body_translated && (
          <button className="mt-1 text-[10px] text-gray-500 underline"
            onClick={() => setShowOriginal(!showOriginal)}>
            {showOriginal ? "번역 보기 · 翻訳を見る" : "원문 보기 · 原文を見る"}
          </button>
        )}
        {foreign && !m.body_translated && (
          <p className="mt-1 text-[10px] text-gray-500">번역 준비 중 · 翻訳準備中</p>
        )}
      </div>
    </div>
  );
}

export default function ChatRoom(props: {
  conversationId: string; viewerId: string; viewerLanguage: "ko" | "ja";
  initialMessages: ChatMessage[];
}) {
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
      setError(err instanceof Error ? err.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} mine={m.sender_id === props.viewerId}
            viewerLanguage={props.viewerLanguage} />
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="px-4 pb-1 text-xs text-red-500">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t bg-white p-3 pb-20">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="메시지 입력 · メッセージを入力" maxLength={1000}
          className="flex-1 rounded-full border px-4 py-2 text-sm" />
        <button disabled={busy || !draft.trim()}
          className="rounded-full bg-tomo-coral px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          전송
        </button>
      </form>
    </div>
  );
}
