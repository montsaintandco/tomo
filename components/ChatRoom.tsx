"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

export type ChatMessage = {
  id: string; conversation_id: string; sender_id: string;
  body: string; body_translated: string | null; image_path?: string | null;
  source_language: "ko" | "ja"; created_at: string;
};

const MAX_IMAGE = 5 * 1024 * 1024;

// 비공개 버킷 — 참여자만 RLS로 서명 URL을 받는다 (1시간)
function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    createBrowserSupabase().storage.from("chat-images").createSignedUrl(path, 3600)
      .then(({ data }) => { if (alive && data) setUrl(data.signedUrl); });
    return () => { alive = false; };
  }, [path]);
  return url;
}

function Bubble({ m, mine, viewerLanguage }: {
  m: ChatMessage; mine: boolean; viewerLanguage: Lang;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const imageUrl = useSignedUrl(m.image_path);
  const foreign = m.source_language !== viewerLanguage;
  const showingTranslation = foreign && !!m.body_translated && !showOriginal;
  const text = showingTranslation ? m.body_translated! : m.body;
  // 발화 언어가 색을 정한다 — 블루=한국어, 핑크=일본어 (나라 색의 유일한 채팅 표면)
  const tone = m.source_language === "ko" ? "bg-tomo-blue/40" : "bg-tomo-pink/45";
  const accent = m.source_language === "ko" ? "text-tomo-navy" : "text-tomo-rose";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-theirs"} max-w-[78%] overflow-hidden text-sm ${tone} ${m.image_path && !text ? "p-1" : "px-3.5 py-2.5"}`}>
        {m.image_path && (
          imageUrl ? (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={t(viewerLanguage, "chat.image")} loading="lazy"
                className={`max-h-72 w-full rounded-[14px] object-cover ${text ? "mb-2" : ""}`} />
            </a>
          ) : (
            <div className="skeleton h-40 w-48 rounded-[14px]" aria-label={t(viewerLanguage, "chat.image")} />
          )
        )}
        {text && (
          <p lang={showingTranslation ? viewerLanguage : m.source_language}
            className="whitespace-pre-wrap break-words leading-relaxed text-ink">{text}</p>
        )}
        {text && foreign && m.body_translated && (
          <button type="button" aria-pressed={showOriginal}
            className={`press mt-1 text-[11px] font-bold underline underline-offset-2 ${accent}`}
            onClick={() => setShowOriginal(!showOriginal)}>
            {showOriginal ? t(viewerLanguage, "detail.viewTranslation") : t(viewerLanguage, "detail.viewOriginal")}
          </button>
        )}
        {text && foreign && !m.body_translated && (
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
  const fileRef = useRef<HTMLInputElement>(null);

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

  // 방에 있는 동안은 읽은 것 — 새 메시지마다 읽음 시각 갱신 (안읽음 배지·점의 원천)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    createBrowserSupabase().from("conversation_reads").upsert({
      conversation_id: props.conversationId, user_id: props.viewerId, last_read_at: new Date().toISOString(),
    }).then(() => {});
  }, [messages.length, props.conversationId, props.viewerId]);

  async function post(payload: { body?: string; imagePath?: string }) {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: props.conversationId, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    setMessages((prev) => prev.some((x) => x.id === json.message.id) ? prev : [...prev, json.message]);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setError("");
    try { await post({ body: text }); setDraft(""); }
    catch (err) { setError(err instanceof Error ? err.message : t(lang, "chat.sendFail")); }
    finally { setBusy(false); }
  }

  async function sendImage(file: File) {
    if (busy) return;
    if (file.size > MAX_IMAGE) { setError(t(lang, "chat.imageTooBig")); return; }
    setBusy(true); setError("");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${props.conversationId}/${props.viewerId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await createBrowserSupabase().storage.from("chat-images")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) throw new Error(t(lang, "chat.imageFail"));
      await post({ imagePath: path });
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, "chat.imageFail"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" id="chat-image"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); }} />
        <label htmlFor="chat-image" aria-label={t(lang, "chat.attach")}
          className={`press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-tomo-navy/5 text-tomo-navy ${busy ? "pointer-events-none opacity-45" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
            strokeLinecap="round" strokeLinejoin="round" className="h-[20px] w-[20px]" aria-hidden>
            <rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m20.5 15.5-4.3-4.3a1.5 1.5 0 0 0-2.1 0L7 18.5" />
          </svg>
        </label>
        <label htmlFor="chat-draft" className="sr-only">{t(lang, "chat.placeholder")}</label>
        {/* 16px 입력 — iOS 포커스 확대 방지 */}
        <input id="chat-draft" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={t(lang, "chat.placeholder")} maxLength={1000} autoComplete="off" enterKeyHint="send"
          className="min-w-0 flex-1 rounded-full bg-tomo-ivory px-4 py-2.5 text-base placeholder:text-ink-soft" />
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
