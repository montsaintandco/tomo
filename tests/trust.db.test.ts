// T3 신뢰·안전 DB 테스트 — 0033·0034 적용 뒤에만 돈다(메인이 적용 후 실행). 라이브 DB의 시험 계정 alice·bob 을 쓴다.
// 만든 상품·대화·신고·외부 상품은 끝에 지운다. 서비스 키가 없으면 외부 상품(client 행) 시험은 건너뛴다.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "test-pass-1234";

let alice: SupabaseClient, bob: SupabaseClient, aliceId: string, bobId: string;
let listingId: string, convId: string;
const admin = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: TEST_PASSWORD });
  if (error) throw error;
  return [c, data.user!.id];
}

beforeAll(async () => {
  [alice, aliceId] = await signIn("alice");
  [bob, bobId] = await signIn("bob");
  await bob.rpc("unblock_user", { p_id: aliceId });
  await alice.rpc("unblock_user", { p_id: bobId });
  const { data: l, error } = await alice.from("listings").insert({
    seller_id: aliceId, title: "T3 차단 시험", description: "시험용", source_language: "ko",
    price: 50000, currency: "KRW", category: "camera", trade_method: "shipping",
    country: "KR", region: "서울 마포구", cross_border_enabled: true, ship_weight_kg: 1, allow_offers: true,
  }).select("id").single();
  if (error) throw error;
  listingId = l!.id;
  const { data: c, error: ce } = await bob.from("conversations").insert({ listing_id: listingId, buyer_id: bobId, seller_id: aliceId }).select("id").single();
  if (ce) throw ce;
  convId = c!.id;
});

afterAll(async () => {
  await bob.rpc("unblock_user", { p_id: aliceId });
  await alice.rpc("unblock_user", { p_id: bobId });
  if (convId) await bob.from("conversations").delete().eq("id", convId);
  if (listingId) {
    if (admin) await admin.from("reports").delete().eq("target_id", listingId);
    await alice.from("listings").delete().eq("id", listingId);
  }
});

const send = (c: SupabaseClient, sender: string, body: string) =>
  c.from("messages").insert({ conversation_id: convId, sender_id: sender, body, source_language: "ko" });

describe("차단 (0033)", () => {
  it("차단 전에는 메시지가 간다", async () => {
    expect((await send(bob, bobId, "안녕하세요")).error).toBeNull();
  });
  it("차단하면 양쪽 다 메시지·가격제안을 못 넣는다", async () => {
    expect((await bob.rpc("block_user", { p_id: aliceId })).error).toBeNull();
    expect((await send(bob, bobId, "차단 뒤")).error?.code).toBe("42501");
    expect((await send(alice, aliceId, "차단 뒤 반대쪽")).error?.code).toBe("42501");
    const offer = await bob.from("offers").insert({ listing_id: listingId, buyer_id: bobId, price: 40000 });
    expect(offer.error?.code).toBe("42501");
  });
  it("차단 목록은 건 사람만 본다", async () => {
    expect((await bob.from("blocks").select("blocked_id").eq("blocked_id", aliceId)).data).toHaveLength(1);
    expect((await alice.from("blocks").select("blocker_id").eq("blocker_id", bobId)).data).toHaveLength(0);
  });
  it("해제하면 다시 간다", async () => {
    expect((await bob.rpc("unblock_user", { p_id: aliceId })).error).toBeNull();
    expect((await send(alice, aliceId, "해제 뒤")).error).toBeNull();
  });
  it("자기 자신은 차단 못 한다", async () => {
    expect((await bob.rpc("block_user", { p_id: bobId })).error?.message).toContain("self");
  });
});

describe("신고 (0033)", () => {
  it("같은 대상 1인 1건, 신고자만 본다", async () => {
    const a = await bob.rpc("report_target", { p_type: "listing", p_id: listingId, p_reason: "spam", p_detail: "" });
    const b = await bob.rpc("report_target", { p_type: "listing", p_id: listingId, p_reason: "fraud", p_detail: "" });
    expect(a.error).toBeNull();
    expect(b.data.id).toBe(a.data.id);
    expect((await alice.from("reports").select("id").eq("id", a.data.id)).data).toHaveLength(0);
  });
  it("자기 상품은 신고 못 한다", async () => {
    const r = await alice.rpc("report_target", { p_type: "listing", p_id: listingId, p_reason: "spam", p_detail: "" });
    expect(r.error?.message).toContain("self");
  });
  it("대화 신고는 상대가 책임 사용자로 남는다", async () => {
    const r = await alice.rpc("report_target", { p_type: "conversation", p_id: convId, p_reason: "abuse", p_detail: "" });
    expect(r.error).toBeNull();
    expect(r.data.target_user_id).toBe(bobId);
    if (admin) await admin.from("reports").delete().eq("id", r.data.id);
  });
  it("일반 사용자는 처리 못 한다", async () => {
    const { data } = await bob.from("reports").select("id").eq("target_id", listingId).single();
    const r = await bob.rpc("admin_resolve_report", { p_id: data!.id, p_status: "resolved", p_note: "" });
    expect(r.error?.message).toContain("admin only");
  });
});

describe.skipIf(!admin)("외부 상품 client 행 (0034)", () => {
  const sid = `t3test${Date.now()}`;
  let itemId = "", reqId = "";
  afterAll(async () => {
    if (reqId) await admin!.from("proxy_requests").delete().eq("id", reqId);
    if (itemId) await admin!.from("external_items").delete().eq("id", itemId);
  });
  it("epoch 스냅샷은 client 로 저장되고 anon·남에게 안 보인다, 요청자에게는 보인다", async () => {
    const { data, error } = await admin!.from("external_items").insert({
      source: "mercari", source_id: sid, url: `https://jp.mercari.com/item/${sid}`, title: "T3 오염 시험",
      price: 1000, currency: "JPY", fetched_at: new Date(0).toISOString(),
    }).select("id, origin").single();
    expect(error).toBeNull();
    expect(data!.origin).toBe("client");
    itemId = data!.id;
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    expect((await anon.from("external_items").select("id").eq("id", itemId)).data).toHaveLength(0);
    expect((await alice.from("external_items").select("id").eq("id", itemId)).data).toHaveLength(0);
    const r = await bob.rpc("request_proxy", { p_external_item_id: itemId, p_note: "" });
    expect(r.error).toBeNull();
    reqId = r.data.id;
    expect((await bob.from("external_items").select("id").eq("id", itemId)).data).toHaveLength(1);
    expect((await alice.from("external_items").select("id").eq("id", itemId)).data).toHaveLength(0);
  });
  it("실데이터로 갱신되면 live 로 바뀌어 공개된다", async () => {
    const { data } = await admin!.from("external_items").update({ fetched_at: new Date().toISOString() }).eq("id", itemId).select("origin").single();
    expect(data!.origin).toBe("live");
    expect((await alice.from("external_items").select("id").eq("id", itemId)).data).toHaveLength(1);
  });
});
