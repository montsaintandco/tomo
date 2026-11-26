// W1 해외 상품 찜 DB 테스트 — 0038 적용 뒤에만 돈다(메인이 적용 후 실행). 라이브 DB의 시험 계정 alice·bob 을 쓴다.
// 만든 찜 행은 끝에 지운다.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "test-pass-1234";
const SID = `w1test${Date.now()}`;

let alice: SupabaseClient, bob: SupabaseClient, aliceId: string, bobId: string;

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: TEST_PASSWORD });
  if (error) throw error;
  return [c, data.user!.id];
}
const row = (userId: string, extra: Record<string, unknown> = {}) => ({
  user_id: userId, source: "mercari", source_id: SID, title: "W1 시험", price: 1200, currency: "JPY", thumb: "", ...extra,
});

beforeAll(async () => {
  [alice, aliceId] = await signIn("alice");
  [bob, bobId] = await signIn("bob");
});
afterAll(async () => {
  await alice.from("external_wishlists").delete().eq("source_id", SID);
  await bob.from("external_wishlists").delete().eq("source_id", SID);
});

describe("external_wishlists (0038)", () => {
  it("본인은 넣고 읽는다", async () => {
    const { error } = await alice.from("external_wishlists").insert(row(aliceId));
    expect(error).toBeNull();
    const { data } = await alice.from("external_wishlists").select("source_id, price").eq("source_id", SID);
    expect(data).toEqual([{ source_id: SID, price: 1200 }]);
  });
  it("같은 상품 두 번은 unique 위반(23505)", async () => {
    const { error } = await alice.from("external_wishlists").insert(row(aliceId));
    expect(error?.code).toBe("23505");
  });
  it("남의 user_id 로는 못 넣는다", async () => {
    const { error } = await bob.from("external_wishlists").insert(row(aliceId, { source_id: `${SID}b` }));
    expect(error).not.toBeNull();
  });
  it("남의 찜은 안 보이고 못 지운다", async () => {
    const { data } = await bob.from("external_wishlists").select("source_id").eq("source_id", SID);
    expect(data).toEqual([]);
    await bob.from("external_wishlists").delete().eq("user_id", aliceId).eq("source_id", SID);
    const { data: still } = await alice.from("external_wishlists").select("source_id").eq("source_id", SID);
    expect(still).toHaveLength(1);
  });
  it("수정 정책 없음 — update 는 0행", async () => {
    const { data } = await alice.from("external_wishlists").update({ price: 1 }).eq("source_id", SID).select("price");
    expect(data ?? []).toEqual([]);
  });
  it("허용 안 된 source·통화·음수 가격은 막는다", async () => {
    for (const bad of [{ source: "ebay" }, { currency: "USD" }, { price: -1 }]) {
      const { error } = await bob.from("external_wishlists").insert(row(bobId, { source_id: `${SID}c`, ...bad }));
      expect(error).not.toBeNull();
    }
  });
  it("본인은 지운다", async () => {
    await alice.from("external_wishlists").delete().eq("user_id", aliceId).eq("source_id", SID);
    const { data } = await alice.from("external_wishlists").select("source_id").eq("source_id", SID);
    expect(data).toEqual([]);
  });
});
