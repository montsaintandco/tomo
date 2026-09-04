import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

// 0017 라이브 검증 — 큐레이션은 누구나 읽고 아무나 못 쓰며, 읽음/푸시 테이블은 익명 접근 불가
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

describe("trending_themes (0017)", () => {
  it("anon can read active themes for both countries", async () => {
    const { data, error } = await anon.from("trending_themes").select("country, key, sources").eq("active", true);
    expect(error).toBeNull();
    expect(data!.filter((r) => r.country === "KR").length).toBeGreaterThanOrEqual(4);
    expect(data!.filter((r) => r.country === "JP").length).toBeGreaterThanOrEqual(4);
  });
  it("anon cannot insert a theme", async () => {
    const { error } = await anon.from("trending_themes").insert({
      country: "KR", key: "hack-test", label: "x", label_ja: "x", term: "x", sources: ["mercari"],
    });
    expect(error).not.toBeNull();
  });
});

describe("chat read/push tables (0017)", () => {
  it("anon cannot read push subscriptions or reads", async () => {
    const subs = await anon.from("push_subscriptions").select("id").limit(1);
    const reads = await anon.from("conversation_reads").select("user_id").limit(1);
    expect(subs.data ?? []).toHaveLength(0);
    expect(reads.data ?? []).toHaveLength(0);
  });
  it("unread_count requires auth (anon gets error or null)", async () => {
    const { data, error } = await anon.rpc("unread_count");
    expect(error !== null || data === null || data === 0).toBe(true);
  });
});
