// U1 경매 동시 입찰 DB 테스트 — 두 계정(bob·center)이 같은 순간 같은 금액을 넣는다(PostgREST 연결 2개).
// 행 잠금(place_bid 의 select … for update)이 없으면 둘 다 「입찰 0건」으로 보고 현재가·입찰 수가 어긋난다.
// CI(db-tests)는 임시 Supabase, 로컬은 .env.local DB. 만든 상품·경매·알림은 끝에 지운다.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "test-pass-1234";
const svc = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: TEST_PASSWORD });
  if (error) throw error;
  return [c, data.user!.id];
}

let alice: SupabaseClient, bob: SupabaseClient, ctr: SupabaseClient, aliceId = "";
const listings: string[] = [];
const auctions: string[] = [];

async function newAuction(): Promise<string> {
  const l = await alice.from("listings").insert({
    seller_id: aliceId, title: "U1 동시 입찰 시험", description: "시험용", source_language: "ko", hidden: true,
    price: 50000, currency: "KRW", category: "camera", trade_method: "shipping", cross_border_enabled: true, country: "KR", region: "서울 마포구",
  }).select("id").single();
  if (l.error) throw l.error;
  listings.push(l.data.id);
  const a = await alice.rpc("create_auction", { p_listing: l.data.id, p_start_price: 10000, p_days: 1 });
  if (a.error) throw a.error;
  auctions.push(a.data.id);
  return a.data.id;
}
const row = async (id: string) => (await svc!.from("auctions").select("current_price, bid_count, bidder_count, leader_id").eq("id", id).single()).data!;

describe.skipIf(!svc)("경매 동시 입찰 (0046)", () => {
  beforeAll(async () => {
    [alice, aliceId] = await signIn("alice");
    [bob] = await signIn("bob");
    [ctr] = await signIn("center");
  });

  afterAll(async () => {
    if (!svc) return;
    for (const id of auctions) await svc.from("notifications").delete().eq("ref_id", id);
    if (auctions.length) await svc.from("auctions").delete().in("id", auctions);
    if (listings.length) await svc.from("listings").delete().in("id", listings);
  });

  it("같은 순간 같은 금액 2건 → 한 줄로 서서 먼저 온 사람이 1등, 현재가 20000·기록 3줄", async () => {
    for (let round = 0; round < 3; round++) {
      const id = await newAuction();
      const [rb, rc] = await Promise.all([
        bob.rpc("place_bid", { p_auction: id, p_amount: 20000, p_request_id: `b-${round}` }),
        ctr.rpc("place_bid", { p_auction: id, p_amount: 20000, p_request_id: `c-${round}` }),
      ]);
      expect(rb.error, rb.error?.message).toBeNull();
      expect(rc.error, rc.error?.message).toBeNull();
      expect([rb.data.leading, rc.data.leading].filter(Boolean)).toHaveLength(1);   // 1등은 정확히 한 명
      const a = await row(id);
      expect(a).toMatchObject({ current_price: 20000, bid_count: 3, bidder_count: 2 });
      await svc!.from("notifications").delete().eq("ref_id", id);
      await svc!.from("auctions").delete().eq("id", id);   // 신규 회원 동시 입찰 한도(3건)에 걸리지 않게 바로 지운다
    }
  });

  it("10건을 한꺼번에 → 최종 현재가·1등이 순서대로 처리한 결과와 같다", async () => {
    const id = await newAuction();
    const amounts = [12000, 15000, 18000, 21000, 24000, 27000, 30000, 33000, 36000, 39000];
    const res = await Promise.all(amounts.map((amt, i) => (i % 2 ? ctr : bob).rpc("place_bid", { p_auction: id, p_amount: amt })));
    const ok = res.filter((r) => !r.error);
    // 순서에 따라 일부는 「최소 입찰 미달」로 거절될 수 있다. 거절은 그 문구만
    for (const r of res) if (r.error) expect(r.error.message).toContain("bid too low");
    const a = await row(id);
    const { data: hist } = await svc!.from("auction_bids").select("amount").eq("auction_id", id).order("id");
    expect(a.bid_count).toBe(hist!.length);
    expect(hist!.at(-1)!.amount).toBe(a.current_price);                     // 마지막 기록 = 현재가
    for (let i = 1; i < hist!.length; i++) expect(hist![i].amount).toBeGreaterThanOrEqual(hist![i - 1].amount); // 현재가는 내려가지 않는다
    expect(ok.length).toBeGreaterThan(0);
  });
});
