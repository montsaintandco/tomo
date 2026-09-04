// tests/cart-rls.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let alice: SupabaseClient, bob: SupabaseClient;
let aliceId: string;
let itemId: string;

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: "test-pass-1234" });
  if (error) throw error;
  return [c, data.user!.id];
}

beforeAll(async () => {
  [alice, aliceId] = await signIn("alice");
  [bob] = await signIn("bob");
  // external_items는 admin/service_role만 쓴다 — 기존 시드된 아무 항목을 빌린다
  const { data } = await alice.from("external_items").select("id").limit(1).maybeSingle();
  if (!data) throw new Error("external_items가 비어 있음 — /global에서 상품 하나 열어 캐시를 만들고 재실행");
  itemId = data.id;
  await alice.from("cart_items").delete().eq("user_id", aliceId);
});

afterAll(async () => { await alice.from("cart_items").delete().eq("user_id", aliceId); });

describe("cart_items RLS", () => {
  it("owner can insert and read own row", async () => {
    const { error } = await alice.from("cart_items").insert({ user_id: aliceId, external_item_id: itemId, note: "M" });
    expect(error).toBeNull();
    const { data } = await alice.from("cart_items").select("note").eq("user_id", aliceId);
    expect(data?.map((r) => r.note)).toEqual(["M"]);
  });
  it("others see nothing and cannot insert for someone else", async () => {
    const { data } = await bob.from("cart_items").select("*").eq("user_id", aliceId);
    expect(data).toEqual([]);
    const { error } = await bob.from("cart_items").insert({ user_id: aliceId, external_item_id: itemId });
    expect(error).not.toBeNull();
  });
});

describe("proxy_orders", () => {
  it("cannot be inserted directly", async () => {
    const { error } = await alice.from("proxy_orders").insert({
      user_id: aliceId, currency: "KRW", subtotal: 1, intl_shipping: 0, service_fee: 0, total: 1, rate: 1,
      payment_method: "card", ship_name: "a", ship_phone: "0", ship_postal: "0", ship_address: "x",
    });
    expect(error).not.toBeNull();
  });
  it("create_proxy_order builds an order with per-item requests and saves address", async () => {
    const { data: o, error } = await alice.rpc("create_proxy_order", {
      p_item_ids: [itemId], p_method: "card",
      p_ship_name: "앨리스", p_ship_phone: "01000000000", p_ship_postal: "04000", p_ship_address: "서울 마포구 1", p_ship_note: "",
    });
    expect(error).toBeNull();
    expect(o.status).toBe("pending_payment");
    expect(o.total).toBe(o.subtotal + o.intl_shipping + o.service_fee);
    expect(o.service_fee).toBe(Math.floor(o.subtotal * 0.1)); // 면세 구간(소계 ≤ 20만원)이면 10%
    const { data: reqs } = await alice.from("proxy_requests").select("id, status").eq("order_id", o.id);
    expect(reqs?.length).toBe(1);
    expect(reqs?.[0].status).toBe("requested");
    const { data: p } = await alice.from("profiles").select("ship_name").eq("id", aliceId).single();
    expect(p?.ship_name).toBe("앨리스");
    // 정리: 대기 주문 취소 → 하위 요청도 cancelled
    const { data: c } = await alice.rpc("cancel_proxy_order", { p_id: o.id });
    expect(c.status).toBe("cancelled");
    const { data: after } = await alice.from("proxy_requests").select("status").eq("order_id", o.id);
    expect(after?.every((r) => r.status === "cancelled")).toBe(true);
  });
});
