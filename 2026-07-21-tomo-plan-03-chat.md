# TOMO Plan 03 — 채팅 (Realtime + 자동번역) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구매자↔판매자 1:1 실시간 채팅을 구축한다. 메시지는 발송 시점에 상대 언어로 번역·저장(스펙 §4)하고, 상대 언어가 다르면 번역문 말풍선 + 원문 토글로 표시(스펙 §7.3). Supabase Realtime으로 실시간 수신.

**Architecture:** `conversations`/`messages` 테이블·기본 RLS는 Plan 01에서 생성 완료. 이 플랜은 (1) 대화 생성 정책 강화 + `messages.source_language` 컬럼 + Realtime 퍼블리케이션 마이그레이션, (2) 발송 API(서버에서 번역 후 INSERT — Realtime 구독자는 번역 포함된 단일 INSERT 이벤트 수신), (3) `/chat` 목록·`/chat/[id]` 채팅방 UI를 추가한다. 대화 생성·메시지 발송은 서버 Route Handler(자체 인증 — 미들웨어 보호 밖), 실시간 수신은 클라이언트 `postgres_changes` 구독(RLS 적용).

**Tech Stack:** 기존 스택 그대로 (Supabase Realtime은 supabase-js 내장, 신규 의존성 없음)

## Global Constraints

- 언어 `'ko'|'ja'` — 메시지 원문 언어는 발신자 프로필에서 서버가 결정
- 번역 실패/`ANTHROPIC_API_KEY` 미설정 시 발송은 성공, `body_translated`는 null → "번역 준비 중" 표시 (스펙 §9)
- 번역은 발송 시점 1회 저장. 조회 시 번역 API 호출 없음 (스펙 §4)
- 메시지 본문 1~1000자 서버 검증
- 말풍선 색은 브랜드 규칙: 원문 언어 ko → 토모 블루, ja → 토모 핑크 (스펙 §2)
- API 라우트는 미들웨어 보호 밖 — 반드시 자체 `getUser()` 인증 (HANDOFF 주의사항)
- Supabase project_id `zftztnkczlblnkgaijzc`. 저장소 /sessions/youthful-gallant-knuth/mnt/tomo, 빌드·npm은 /tmp/build/tomo (rsync 후 역복사)

---

### Task 1: 채팅 마이그레이션 (정책 강화 + source_language + Realtime)

**Files:**
- Create: `supabase/migrations/0006_chat.sql`

**Interfaces:**
- Produces: `messages.source_language` (`'ko'|'ja'`) — 말풍선 색·번역 방향 판정용
- Produces: 강화된 `buyer starts conversation` 정책 — seller_id 위조·셀프 채팅 차단
- Produces: `messages` Realtime 퍼블리케이션 (INSERT 이벤트, RLS 적용)

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/0006_chat.sql`:

```sql
-- 발신자 언어 저장 (번역 방향·말풍선 색 판정). 테이블은 비어 있지만 안전하게 default 후 제거
alter table messages add column source_language text not null default 'ko'
  check (source_language in ('ko','ja'));
alter table messages alter column source_language drop default;

-- 대화 생성 정책 강화: seller_id는 해당 상품의 실제 판매자여야 하고, 본인 상품에는 채팅 불가
drop policy "buyer starts conversation" on conversations;
create policy "buyer starts conversation" on conversations for insert
  with check (
    buyer_id = auth.uid()
    and buyer_id <> seller_id
    and exists (select 1 from listings l where l.id = listing_id and l.seller_id = seller_id)
  );

-- Realtime: messages INSERT 이벤트 발행 (구독은 RLS로 참여자만)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
```

- [ ] **Step 2: 적용** — MCP `apply_migration` (name: `chat`)
- [ ] **Step 3: 검증** — MCP `execute_sql`로 `pg_publication_tables`에 messages 존재 + `pg_policies`에서 새 정책 확인
- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat: chat migration - policy hardening, source_language, realtime"`

---

### Task 2: 메시지 번역 유틸 + 대화·메시지 API

**Files:**
- Modify: `lib/translate.ts`
- Create: `app/api/conversations/route.ts`, `app/api/messages/route.ts`

**Interfaces:**
- Produces: `translateMessage(body: string, from: "ko"|"ja"): Promise<string | null>` — 서버 전용, 키 없음/실패 시 null
- Produces: `POST /api/conversations` — body `{listingId}` → `{id}` 200(기존)/201(신규). find-or-create, 본인 상품 400
- Produces: `POST /api/messages` — body `{conversationId, body}` → `{message}` 201. 서버가 발신자 언어 결정→번역→INSERT

- [ ] **Step 1: 번역 함수 추가** — `lib/translate.ts`에 추가 (기존 `translateListing` 아래):

```ts
export async function translateMessage(
  body: string, from: "ko" | "ja"
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const to = from === "ko" ? "ja" : "ko";
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Translate this short secondhand-marketplace chat message from ${LANG_NAME[from]} to ${LANG_NAME[to]}. Keep it casual and natural. Reply with ONLY the translation, nothing else.\n\n${body}`,
      }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const out = block.text.trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 대화 API** — `app/api/conversations/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { listingId } = await req.json().catch(() => ({}));
  if (typeof listingId !== "string")
    return NextResponse.json({ error: "invalid listingId" }, { status: 400 });

  const { data: listing } = await supabase.from("listings")
    .select("id, seller_id").eq("id", listingId).maybeSingle();
  if (!listing) return NextResponse.json({ error: "listing not found" }, { status: 404 });
  if (listing.seller_id === auth.user.id)
    return NextResponse.json({ error: "cannot chat on own listing" }, { status: 400 });

  const { data: existing } = await supabase.from("conversations")
    .select("id").eq("listing_id", listingId).eq("buyer_id", auth.user.id).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id });

  const { data: created, error } = await supabase.from("conversations").insert({
    listing_id: listingId, buyer_id: auth.user.id, seller_id: listing.seller_id,
  }).select("id").single();
  if (error) {
    // unique(listing_id, buyer_id) 경합 → 재조회
    const { data: retry } = await supabase.from("conversations")
      .select("id").eq("listing_id", listingId).eq("buyer_id", auth.user.id).maybeSingle();
    if (retry) return NextResponse.json({ id: retry.id });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: created.id }, { status: 201 });
}
```

- [ ] **Step 3: 메시지 API** — `app/api/messages/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { translateMessage } from "@/lib/translate";

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { conversationId, body } = await req.json().catch(() => ({}));
  if (typeof conversationId !== "string" || typeof body !== "string")
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  const text = body.trim();
  if (text.length === 0 || text.length > 1000)
    return NextResponse.json({ error: "message must be 1-1000 chars" }, { status: 400 });

  // RLS: 참여자가 아니면 대화가 조회되지 않음 → 404
  const { data: convo } = await supabase.from("conversations")
    .select("id").eq("id", conversationId).maybeSingle();
  if (!convo) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const { data: profile } = await supabase.from("profiles")
    .select("language").eq("id", auth.user.id).single();
  const from = (profile?.language ?? "ko") as "ko" | "ja";

  const translated = await translateMessage(text, from); // 실패해도 발송 성공 (스펙 §9)

  const { data: message, error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: auth.user.id,
    body: text,
    body_translated: translated,
    source_language: from,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ message }, { status: 201 });
}
```

- [ ] **Step 4: 빌드 확인 + 미인증 401 검증** — `next build` 통과, curl로 미인증 POST `/api/conversations`·`/api/messages` → 401
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat: conversation + message APIs with translation"`

---

### Task 3: 채팅 목록 `/chat` + 상세 진입 버튼

**Files:**
- Create: `app/chat/page.tsx`, `components/ChatButton.tsx`
- Modify: `app/listings/[id]/page.tsx` (채팅하기 Link → ChatButton)

**Interfaces:**
- Consumes: `getViewer`, `displayTitle` (Plan 02), `POST /api/conversations` (Task 2)
- Produces: `/chat` — 대화 목록 (상품 썸네일·번역 제목, 상대 닉네임, 마지막 메시지 미리보기·시각, 최근 메시지순)
- Produces: `<ChatButton listingId={...} />` — POST 후 `/chat/[id]` 이동

- [ ] **Step 1: ChatButton** — `components/ChatButton.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChatButton({ listingId }: { listingId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function start() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/chat/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "채팅 시작 실패");
      setBusy(false);
    }
  }

  return (
    <div className="flex-1">
      <button onClick={start} disabled={busy}
        className="w-full rounded-full border border-tomo-navy py-3 text-center font-bold text-tomo-navy disabled:opacity-50">
        {busy ? "연결 중…" : "채팅하기"}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: 상세 페이지 수정** — `app/listings/[id]/page.tsx`의 `<Link href={/chat?listing=...}>채팅하기</Link>`를 `<ChatButton listingId={l.id} />`로 교체 (import 추가)
- [ ] **Step 3: 목록 페이지** — `app/chat/page.tsx` (서버 컴포넌트):

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import Link from "next/link";
import { redirect } from "next/navigation";

type LastMessage = { body: string; body_translated: string | null; source_language: string; created_at: string };

function preview(m: LastMessage | undefined, viewerLanguage: string): string {
  if (!m) return "대화를 시작해 보세요 · 会話を始めましょう";
  if (m.source_language === viewerLanguage) return m.body;
  return m.body_translated ?? m.body;
}

export default async function ChatListPage() {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");

  const { data: convos } = await supabase.from("conversations")
    .select(`id, buyer_id, seller_id, created_at,
      listings(id, title, source_language, images, listing_translations(language, title)),
      buyer:profiles!conversations_buyer_id_fkey(nickname),
      seller:profiles!conversations_seller_id_fkey(nickname),
      messages(body, body_translated, source_language, created_at)`)
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
    .limit(50);

  const sorted = (convos ?? []).slice().sort((a, b) => {
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
```

주의: supabase-js 임베드 to-one 관계(`buyer`/`seller`/`listings`)가 배열로 타이핑되면 구현 시 `as unknown as` 캐스팅 또는 배열 인덱싱으로 정규화. `referencedTable` 옵션이 구버전에서 `foreignTable`일 수 있음 — 설치된 supabase-js 버전에 맞출 것.

- [ ] **Step 4: 빌드 + 커밋** — `git add -A && git commit -m "feat: chat list + chat entry button"`

---

### Task 4: 채팅방 `/chat/[id]` (Realtime 구독 + 번역 말풍선)

**Files:**
- Create: `app/chat/[id]/page.tsx`, `components/ChatRoom.tsx`

**Interfaces:**
- Consumes: `POST /api/messages` (Task 2), Realtime `postgres_changes` INSERT (Task 1)
- Produces: `/chat/[id]` — 헤더(상대 닉네임 + 상품 카드 링크), 메시지 목록(내 메시지 오른쪽, 말풍선 색 = 원문 언어, 상대 언어 다르면 번역문 + 원문 토글), 입력창

- [ ] **Step 1: ChatRoom 클라이언트 컴포넌트** — `components/ChatRoom.tsx`:

```tsx
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
```

- [ ] **Step 2: 채팅방 페이지** — `app/chat/[id]/page.tsx` (서버 컴포넌트):

```tsx
import { createServerSupabase } from "@/lib/supabase/server";
import { getViewer, displayTitle } from "@/lib/listings";
import { formatWithConversion } from "@/lib/currency";
import ChatRoom, { type ChatMessage } from "@/components/ChatRoom";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function ChatDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabase();
  const viewer = await getViewer(supabase);
  if (!viewer) redirect("/onboarding");

  const { data: convo } = await supabase.from("conversations")
    .select(`id, buyer_id, seller_id,
      listings(id, title, price, currency, source_language, country, status, images,
        listing_translations(language, title)),
      buyer:profiles!conversations_buyer_id_fkey(id, nickname),
      seller:profiles!conversations_seller_id_fkey(id, nickname)`)
    .eq("id", params.id).maybeSingle();
  if (!convo) notFound(); // RLS: 비참여자는 여기서 차단

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
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-card bg-gray-100">
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
```

(임베드 to-one 타이핑 이슈는 Task 3와 동일하게 캐스팅으로 처리. BottomNav가 입력창을 가리면 채팅방에서만 하단 여백 `pb-20` 조정 또는 BottomNav 숨김 처리 — 구현 시 판단)

- [ ] **Step 3: 빌드 + 커밋** — `git add -A && git commit -m "feat: chat room with realtime + translated bubbles"`

---

### Task 5: 통합 테스트 + E2E 검증

**Files:**
- Create: `tests/chat.test.ts`

**Interfaces:**
- Consumes: 전체. alice(ko/KR)·bob(ja/JP) 테스트 계정, bob의 시드 상품

- [ ] **Step 1: RLS 통합 테스트 작성** — `tests/chat.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let alice: SupabaseClient, bob: SupabaseClient;
let aliceId: string, bobId: string;
let bobListingId: string;
let convoId: string;

beforeAll(async () => {
  alice = createClient(url, anonKey, { auth: { persistSession: false } });
  bob = createClient(url, anonKey, { auth: { persistSession: false } });
  const a = await alice.auth.signInWithPassword({
    email: "tomo.test.alice@gmail.com", password: "test-pass-1234" });
  const b = await bob.auth.signInWithPassword({
    email: "tomo.test.bob@gmail.com", password: "test-pass-1234" });
  if (a.error || b.error) throw a.error ?? b.error;
  aliceId = a.data.user!.id; bobId = b.data.user!.id;
  const { data: l } = await bob.from("listings")
    .select("id").eq("seller_id", bobId).limit(1).single();
  bobListingId = l!.id;
});

describe("chat RLS", () => {
  it("buyer can find-or-create conversation on another seller's listing", async () => {
    const { data: existing } = await alice.from("conversations")
      .select("id").eq("listing_id", bobListingId).eq("buyer_id", aliceId).maybeSingle();
    if (existing) { convoId = existing.id; return; }
    const { data, error } = await alice.from("conversations").insert({
      listing_id: bobListingId, buyer_id: aliceId, seller_id: bobId,
    }).select("id").single();
    expect(error).toBeNull();
    convoId = data!.id;
  });

  it("rejects forged seller_id", async () => {
    const { error } = await alice.from("conversations").insert({
      listing_id: bobListingId, buyer_id: aliceId, seller_id: aliceId,
    });
    expect(error).not.toBeNull();
  });

  it("rejects chatting on own listing", async () => {
    const { data: mine } = await alice.from("listings")
      .select("id").eq("seller_id", aliceId).limit(1).single();
    const { error } = await alice.from("conversations").insert({
      listing_id: mine!.id, buyer_id: aliceId, seller_id: aliceId,
    });
    expect(error).not.toBeNull();
  });

  it("participant can send and both sides read messages", async () => {
    const { error } = await alice.from("messages").insert({
      conversation_id: convoId, sender_id: aliceId,
      body: "[test] 안녕하세요", body_translated: "[test] こんにちは", source_language: "ko",
    });
    expect(error).toBeNull();
    const { data: bobSees } = await bob.from("messages")
      .select("id, source_language").eq("conversation_id", convoId);
    expect((bobSees ?? []).length).toBeGreaterThan(0);
  });

  it("rejects spoofed sender_id", async () => {
    const { error } = await bob.from("messages").insert({
      conversation_id: convoId, sender_id: aliceId, body: "spoof", source_language: "ja",
    });
    expect(error).not.toBeNull();
  });

  it("anonymous client reads nothing", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await anon.from("messages").select("id").eq("conversation_id", convoId);
    expect(data ?? []).toHaveLength(0);
  });
});
```

(주: delete 정책이 없어 테스트 대화·메시지는 잔류 — find-or-create로 대화는 1개 고정, 메시지는 실행당 1건 누적. 허용 범위. 3자 비참여 read 테스트는 계정 2개 한계로 anon 검증으로 대체)

- [ ] **Step 2: 전체 테스트 실행** — `npx vitest run` — 기존 13개 + 신규 6개 = 19개 전부 PASS, 2회 연속 실행으로 멱등 확인
- [ ] **Step 3: 수동 E2E** — `next build && next start` 후 브라우저 두 세션(alice/bob)으로: 상세→채팅하기→메시지 발송→상대 화면 실시간 수신·번역 말풍선·원문 토글 확인 (API 키 없으면 "번역 준비 중" 확인)
- [ ] **Step 4: 커밋 + 레저 갱신** — progress.md에 P3 기록, HANDOFF.md 로드맵 갱신, `git add -A && git commit -m "feat: chat integration tests"`

---

## Self-Review 결과

- 스펙 커버리지: 실시간 채팅(§3.3)·발송 시점 번역 저장(§4)·번역문 말풍선+원문 토글(§7.3)·번역 실패 허용(§9)·참여자만 열람 RLS(§9) 모두 태스크 존재. `/chat`·`/chat/[id]` 페이지 구조(§8) 일치
- 보안: 대화 생성 정책 강화(seller_id 위조·셀프 채팅 차단), sender_id 스푸핑은 기존 정책이 차단, API 자체 인증(미들웨어 밖), Realtime은 RLS 적용 구독
- 플레이스홀더: 없음. 읽음 표시·미읽음 배지·푸시 알림은 MVP 제외(스펙 §3)
- 이월 처리: 조회 시 번역 재시도(§9)는 상품과 동일하게 미구현 이월, 메시지 페이지네이션(100건 초과)은 P4+ 이월
