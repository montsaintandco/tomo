// W3 가격 잠금 DB 테스트 — 0039 적용 뒤에만 돈다(메인이 적용 후 실행). 라이브 DB의 시험 계정 alice·bob 을 쓴다.
// 판매자(alice)가 직접 update 로 가격을 바꾸는 우회를 트리거가 막는지 본다. 만든 상품·거래는 끝에 지운다.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "test-pass-1234";
const svc = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

let alice: SupabaseClient, aliceId = "", bobId = "", listingId = "", txId = "";

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: TEST_PASSWORD });
  if (error) throw error;
  return [c, data.user!.id];
}
const setPrice = (price: number) => alice.from("listings").update({ price }).eq("id", listingId);
const priceNow = async () => (await svc!.from("listings").select("price").eq("id", listingId).single()).data?.price;

describe.skipIf(!svc)("판매자 가격 잠금 (0039)", () => {
  beforeAll(async () => {
    [alice, aliceId] = await signIn("alice");
    [, bobId] = await signIn("bob");
    const l = await alice.from("listings").insert({
      seller_id: aliceId, title: "W3 가격 잠금 시험", description: "시험용", source_language: "ko",
      price: 50000, currency: "KRW", category: "camera", trade_method: "shipping", country: "KR", region: "서울 마포구",
    }).select("id").single();
    if (l.error) throw l.error;
    listingId = l.data.id;
  });

  afterAll(async () => {
    if (!svc) return;
    if (txId) await svc.from("transactions").delete().eq("id", txId);
    if (listingId) {
      await svc.from("notifications").delete().eq("ref_id", listingId);
      await svc.from("listings").delete().eq("id", listingId);
    }
  });

  it("거래가 없으면 판매자가 가격을 바꿀 수 있다", async () => {
    expect((await setPrice(45000)).error).toBeNull();
    expect(await priceNow()).toBe(45000);
  });

  it("진행 중 거래가 있으면 직접 update 도 거부, 다른 칸은 된다", async () => {
    const tx = await svc!.from("transactions").insert({
      listing_id: listingId, buyer_id: bobId, seller_id: aliceId, status: "paid", is_cross_border: false,
      item_price: 45000, intl_shipping_fee: 0, platform_fee: 0, currency: "KRW",
    }).select("id").single();
    if (tx.error) throw tx.error;
    txId = tx.data.id;
    expect((await setPrice(30000)).error?.message).toMatch(/price locked/);
    expect(await priceNow()).toBe(45000);
    expect((await alice.from("listings").update({ title: "W3 거래 중 제목" }).eq("id", listingId)).error).toBeNull();
    expect((await alice.from("listings").update({ price: 45000, title: "W3 같은 가격" }).eq("id", listingId)).error).toBeNull();
  });

  it("예약중이면 거래가 끝났어도 거부", async () => {
    await svc!.from("transactions").update({ status: "cancelled" }).eq("id", txId);
    await svc!.from("listings").update({ status: "reserved" }).eq("id", listingId);
    expect((await setPrice(30000)).error?.message).toMatch(/price locked/);
    expect(await priceNow()).toBe(45000);
  });

  it("거래 취소·예약 해제 뒤에는 다시 바꿀 수 있다", async () => {
    await svc!.from("listings").update({ status: "active" }).eq("id", listingId);
    expect((await setPrice(30000)).error).toBeNull();
    expect(await priceNow()).toBe(30000);
  });
});
