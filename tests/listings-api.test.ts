import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let alice: SupabaseClient;
let aliceId: string;

beforeAll(async () => {
  alice = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await alice.auth.signInWithPassword({
    email: "tomo.test.alice@gmail.com", password: "test-pass-1234",
  });
  if (error) throw error;
  aliceId = data.user!.id;
});

afterAll(async () => {
  await alice.from("listings").delete().eq("seller_id", aliceId).eq("title", "테스트 상품");
});

describe("listings", () => {
  it("seller can insert own listing and translation", async () => {
    const { data: listing, error } = await alice.from("listings").insert({
      seller_id: aliceId, title: "테스트 상품", description: "설명", source_language: "ko",
      price: 10000, currency: "KRW", category: "etc", trade_method: "both",
      country: "KR", region: "서울 마포구", cross_border_enabled: true,
    }).select().single();
    expect(error).toBeNull();
    const { error: te } = await alice.from("listing_translations").insert({
      listing_id: listing!.id, language: "ja", title: "テスト商品", description: "説明",
    });
    expect(te).toBeNull();
  });

  it("seller cannot write translations for others' listings", async () => {
    const bob = createClient(url, anonKey, { auth: { persistSession: false } });
    await bob.auth.signInWithPassword({ email: "tomo.test.bob@gmail.com", password: "test-pass-1234" });
    const { data: mine } = await alice.from("listings").select("id").eq("seller_id", aliceId).limit(1).single();
    const { error } = await bob.from("listing_translations").insert({
      listing_id: mine!.id, language: "ja", title: "x", description: "x",
    });
    expect(error).not.toBeNull();
  });

  it("feed query returns translations inline", async () => {
    const { data } = await alice.from("listings")
      .select("id, title, listing_translations(language, title)")
      .eq("seller_id", aliceId).eq("title", "테스트 상품")
      .order("created_at", { ascending: false }).limit(1).single();
    expect(data!.listing_translations.length).toBeGreaterThan(0);
  });
});
