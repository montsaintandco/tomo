import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let alice: SupabaseClient; // KR seller
let bob: SupabaseClient;   // JP buyer
let aliceId: string, bobId: string;
let listingId: string, convId: string;

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({
    email: `tomo.test.${tag}@gmail.com`,
    password: "test-pass-1234",
  });
  if (error) throw error;
  return [c, data.user!.id];
}

beforeAll(async () => {
  [alice, aliceId] = await signIn("alice");
  [bob, bobId] = await signIn("bob");
  const ensureProfile = async (client: SupabaseClient, profile: { id: string; nickname: string; country: string; region: string; language: string }) => {
    const { data: existing } = await client.from("profiles").select("id").eq("id", profile.id).maybeSingle();
    if (existing) return;
    const { error } = await client.from("profiles").insert(profile);
    if (error && error.code !== "23505") throw error;
  };
  await ensureProfile(alice, { id: aliceId, nickname: "alice", country: "KR", region: "서울 마포구", language: "ko" });
  await ensureProfile(bob, { id: bobId, nickname: "bob", country: "JP", region: "東京 新宿区", language: "ja" });
  const { data: listing, error: le } = await alice.from("listings").insert({
    seller_id: aliceId, title: "필름카메라", description: "잘 작동해요", source_language: "ko",
    price: 50000, currency: "KRW", category: "camera", trade_method: "shipping",
    country: "KR", region: "서울 마포구", cross_border_enabled: true,
  }).select().single();
  if (le) throw le;
  listingId = listing!.id;
  const { data: conv, error: ce } = await bob.from("conversations").insert({
    listing_id: listingId, buyer_id: bobId, seller_id: aliceId,
  }).select().single();
  if (ce) throw ce;
  convId = conv!.id;
});

afterAll(async () => {
  // 실제로 지운다 — 예전엔 sold로 이름만 바꿔 남겨서 실행할 때마다 피드에 쓰레기가 쌓였음.
  // messages·listing_translations는 FK cascade. 대화 삭제는 0013 정책 필요.
  if (!listingId) return;
  if (convId) {
    const { error } = await bob.from("conversations").delete().eq("id", convId);
    if (error) console.warn("cleanup: conversation delete 실패 (0013 적용 확인):", error.message);
  }
  const { error } = await alice.from("listings").delete().eq("id", listingId);
  if (error) console.warn("cleanup: listing delete 실패:", error.message);
});

describe("RLS", () => {
  it("blocks updating another user's profile", async () => {
    const { data } = await bob.from("profiles").update({ nickname: "hacked" }).eq("id", aliceId).select();
    expect(data).toEqual([]);
  });

  it("blocks inserting a listing as someone else", async () => {
    const { error } = await bob.from("listings").insert({
      seller_id: aliceId, title: "x", description: "x", source_language: "ja",
      price: 100, currency: "JPY", category: "etc", trade_method: "shipping",
      country: "JP", region: "東京 新宿区",
    });
    expect(error).not.toBeNull();
  });

  it("wishlist: blocks wishing as someone else, allows own, count is public", async () => {
    const { error } = await bob.from("wishlists").insert({ user_id: aliceId, listing_id: listingId });
    expect(error).not.toBeNull();
    const { error: ok } = await bob.from("wishlists").insert({ user_id: bobId, listing_id: listingId });
    expect(ok).toBeNull();
    const { data: n } = await alice.rpc("wishlist_count", { lid: listingId });
    expect(n).toBe(1);
  });

  it("offers: buyer offers below price, seller can't self-offer, only seller accepts and price drops", async () => {
    const { error: self } = await alice.from("offers").insert({ listing_id: listingId, buyer_id: aliceId, price: 40000 });
    expect(self).not.toBeNull();
    const { data: o, error } = await bob.from("offers")
      .insert({ listing_id: listingId, buyer_id: bobId, price: 45000 }).select().single();
    expect(error).toBeNull();
    const { data: seen } = await alice.from("offers").select("id").eq("listing_id", listingId);
    expect(seen).toHaveLength(1);
    const { error: bobAccept } = await bob.rpc("respond_offer", { oid: o!.id, accept: true });
    expect(bobAccept).not.toBeNull();
    const { error: ok } = await alice.rpc("respond_offer", { oid: o!.id, accept: true });
    expect(ok).toBeNull();
    const { data: l } = await alice.from("listings").select("price").eq("id", listingId).single();
    expect(l!.price).toBe(45000);
  });

  it("bump: only the seller, and not within 48h of listing", async () => {
    const { error: bobBump } = await bob.rpc("bump_listing", { lid: listingId });
    expect(bobBump).not.toBeNull();
    const { error: tooSoon } = await alice.rpc("bump_listing", { lid: listingId });
    expect(tooSoon).not.toBeNull();
  });

  it("allows participants to read their conversation", async () => {
    const { data } = await alice.from("conversations").select().eq("id", convId);
    expect(data).toHaveLength(1);
  });

  it("blocks non-participants from reading conversations", async () => {
    const outsider = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await outsider.from("conversations").select().eq("id", convId);
    expect(data).toEqual([]);
  });

  it("blocks direct writes to transactions from clients", async () => {
    const { error } = await alice.from("transactions").insert({
      listing_id: listingId, buyer_id: bobId, seller_id: aliceId,
      is_cross_border: false, item_price: 50000, currency: "KRW",
    });
    expect(error).not.toBeNull();
  });

  it("blocks self-escalation of is_admin and trust_temp", async () => {
    const { error: e1 } = await alice.from("profiles").update({ is_admin: true }).eq("id", aliceId);
    expect(e1).not.toBeNull();
    const { error: e2 } = await alice.from("profiles").update({ trust_temp: 99.9 }).eq("id", aliceId);
    expect(e2).not.toBeNull();
  });
});
