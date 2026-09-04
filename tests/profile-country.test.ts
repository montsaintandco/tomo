// tests/profile-country.test.ts — 0019: 본인 country 변경 허용, 타인 불가
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function signIn(tag: string) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: "test-pass-1234" });
  if (error) throw error;
  return [c, data.user!.id] as const;
}

describe("profiles.country update", () => {
  let restore: null | (() => Promise<void>) = null;
  afterAll(async () => { await restore?.(); });

  it("owner can switch country and region, then revert", async () => {
    const [alice, id] = await signIn("alice");
    const { data: before } = await alice.from("profiles").select("country, region").eq("id", id).single();
    restore = async () => { await alice.from("profiles").update({ country: before!.country, region: before!.region }).eq("id", id); };
    const next = before!.country === "KR" ? { country: "JP", region: "東京 新宿区" } : { country: "KR", region: "서울 강남구" };
    const { error } = await alice.from("profiles").update(next).eq("id", id);
    expect(error).toBeNull();
    const { data: after } = await alice.from("profiles").select("country").eq("id", id).single();
    expect(after?.country).toBe(next.country);
  });

  it("others cannot change my country", async () => {
    const [bob] = await signIn("bob");
    const [, aliceId] = await signIn("alice");
    const { data } = await bob.from("profiles").update({ country: "JP" }).eq("id", aliceId).select("id");
    expect(data ?? []).toHaveLength(0); // RLS: 0행 영향
  });
});
