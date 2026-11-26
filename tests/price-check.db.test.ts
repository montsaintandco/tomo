// tests/price-check.db.test.ts — 0035 적용 뒤 메인이 돌린다(라이브 DB). 신선도 15분 경계를 DB에서 확인한다.
// 시험용 외부 상품 1개(mercari / tomo-test-pricecheck)를 service_role 로 만들고 fetched_at 을 바꿔 가며 주문해 본다.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "test-pass-1234";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let alice: SupabaseClient, admin: SupabaseClient;
let aliceId = "", itemId = "";
const ship = { p_ship_name: "앨리스", p_ship_phone: "01000000000", p_ship_postal: "04000", p_ship_address: "서울 마포구 1", p_ship_note: "" };
const setFetched = (msAgo: number) => admin.from("external_items").update({ fetched_at: new Date(Date.now() - msAgo).toISOString(), status: "active" }).eq("id", itemId);

describe.skipIf(!serviceKey)("create_proxy_order 신선도 15분 (0035)", () => {
  beforeAll(async () => {
    admin = createClient(url, serviceKey!, { auth: { persistSession: false } });
    alice = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await alice.auth.signInWithPassword({ email: "tomo.test.alice@gmail.com", password: TEST_PASSWORD });
    if (error) throw error;
    aliceId = data.user!.id;
    const { data: it, error: iErr } = await admin.from("external_items").upsert({
      source: "mercari", source_id: "tomo-test-pricecheck", url: "https://jp.mercari.com/item/tomo-test-pricecheck",
      title: "TOMO price-check test", price: 1000, currency: "JPY", images: [], seller_name: "", status: "active", fetched_at: new Date().toISOString(),
    }, { onConflict: "source,source_id" }).select("id").single();
    if (iErr) throw iErr;
    itemId = it.id;
    await alice.from("cart_items").delete().eq("user_id", aliceId).eq("external_item_id", itemId);
    const { error: cErr } = await alice.from("cart_items").insert({ user_id: aliceId, external_item_id: itemId });
    if (cErr) throw cErr;
  });

  afterAll(async () => {
    if (!aliceId) return;
    await alice.from("cart_items").delete().eq("user_id", aliceId).eq("external_item_id", itemId);
    await setFetched(0);
  });

  it("16분 지난 항목은 'stale item' 으로 거부", async () => {
    await setFetched(16 * 60_000);
    const { data, error } = await alice.rpc("create_proxy_order", { p_item_ids: [itemId], p_method: "card", ...ship });
    expect(data).toBeNull();
    expect(error?.message).toContain("stale item");
  });

  it("품절 항목은 'stale item' 으로 거부", async () => {
    await admin.from("external_items").update({ status: "sold", fetched_at: new Date().toISOString() }).eq("id", itemId);
    const { error } = await alice.rpc("create_proxy_order", { p_item_ids: [itemId], p_method: "card", ...ship });
    expect(error?.message).toContain("stale item");
  });

  it("14분 된 항목은 주문된다(그 뒤 취소)", async () => {
    await setFetched(14 * 60_000);
    const { data: o, error } = await alice.rpc("create_proxy_order", { p_item_ids: [itemId], p_method: "card", ...ship });
    expect(error).toBeNull();
    expect(o.status).toBe("pending_payment");
    const { error: cErr } = await alice.rpc("cancel_proxy_order", { p_id: o.id });
    expect(cErr).toBeNull();
  });
});
