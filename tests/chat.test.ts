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

  it("rejects seller_id that is not the listing's actual seller", async () => {
    // 실존 프로필(bob)을 alice 본인 상품의 판매자로 위조 — buyer<>seller 절과 FK를
    // 우회하지만 상품 실제 판매자(alice)와 불일치하므로 정책이 거부해야 함
    const { data: mine } = await alice.from("listings")
      .select("id").eq("seller_id", aliceId).limit(1).single();
    const { error } = await alice.from("conversations").insert({
      listing_id: mine!.id, buyer_id: aliceId, seller_id: bobId,
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
