// T8 어드민 운영 DB 테스트 — 0037 적용 뒤에만 돈다(메인이 적용 후 실행). 라이브 DB의 시험 계정 alice·bob 을 쓴다.
// 서비스 키로 bob 을 잠깐 운영자로 만들고 끝에 되돌린다. 만든 상품·거래·외부 상품·대행 요청·활동 기록·알림은 끝에 지운다.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? "test-pass-1234";
const svc = serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

let alice: SupabaseClient, bob: SupabaseClient, aliceId: string, bobId: string;
let bobWasAdmin = false;
let itemId = "", reqId = "", listingId = "", txId = "";

async function signIn(tag: string): Promise<[SupabaseClient, string]> {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `tomo.test.${tag}@gmail.com`, password: TEST_PASSWORD });
  if (error) throw error;
  return [c, data.user!.id];
}

const lastAction = async (targetId: string, action: string) =>
  (await svc!.from("admin_actions").select("action, detail, admin_id").eq("target_id", targetId).eq("action", action)
    .order("created_at", { ascending: false }).limit(1)).data?.[0] as { action: string; detail: Record<string, unknown>; admin_id: string } | undefined;

describe.skipIf(!svc)("어드민 운영 (0037)", () => {
  beforeAll(async () => {
    [alice, aliceId] = await signIn("alice");
    [bob, bobId] = await signIn("bob");
    bobWasAdmin = !!(await svc!.from("profiles").select("is_admin").eq("id", bobId).single()).data?.is_admin;
    await svc!.from("profiles").update({ is_admin: true }).eq("id", bobId);

    const sid = `t8test${Date.now()}`;
    const it = await svc!.from("external_items").insert({
      source: "mercari", source_id: sid, url: `https://jp.mercari.com/item/${sid}`, title: "T8 상태 시험", price: 1000, currency: "JPY", fetched_at: new Date().toISOString(),
    }).select("id").single();
    if (it.error) throw it.error;
    itemId = it.data.id;
    const rq = await svc!.from("proxy_requests").insert({ user_id: aliceId, external_item_id: itemId, status: "paid", note: "T8" }).select("id").single();
    if (rq.error) throw rq.error;
    reqId = rq.data.id;

    const l = await alice.from("listings").insert({
      seller_id: aliceId, title: "T8 수정 시험", description: "시험용", source_language: "ko",
      price: 50000, currency: "KRW", category: "camera", trade_method: "shipping", country: "KR", region: "서울 마포구",
    }).select("id").single();
    if (l.error) throw l.error;
    listingId = l.data.id;
  });

  afterAll(async () => {
    if (!svc) return;
    if (txId) await svc.from("transactions").delete().eq("id", txId);
    for (const id of [reqId, listingId].filter(Boolean)) await svc.from("admin_actions").delete().eq("target_id", id);
    if (reqId) {
      await svc.from("notifications").delete().eq("ref_id", reqId);
      await svc.from("proxy_requests").delete().eq("id", reqId);
    }
    if (itemId) await svc.from("external_items").delete().eq("id", itemId);
    if (listingId) await svc.from("listings").delete().eq("id", listingId);
    if (bobId) await svc.from("profiles").update({ is_admin: bobWasAdmin }).eq("id", bobId);
  });

  describe("admin_set_order_status", () => {
    const set = (c: SupabaseClient, to: string, note = "", tracking: string | null = null) =>
      c.rpc("admin_set_order_status", { p_id: reqId, p_status: to, p_note: note, p_tracking: tracking });
    const statusNow = async () => (await svc!.from("proxy_requests").select("status, intl_tracking").eq("id", reqId).single()).data!;

    it("운영자가 아니면 거부", async () => {
      expect((await set(alice, "purchasing")).error?.message).toContain("admin only");
      expect((await statusNow()).status).toBe("paid");
    });
    it("돈이 걸린 전이(취소·완료)는 거부되고 상태가 그대로다", async () => {
      expect((await set(bob, "cancelled")).error?.message).toMatch(/money transition/);
      expect((await set(bob, "completed")).error?.message).toMatch(/money transition/);
      expect((await statusNow()).status).toBe("paid");
    });
    it("표에 없는 전이(건너뛰기)는 거부", async () => {
      expect((await set(bob, "center_received")).error?.message).toMatch(/not allowed/);
      expect((await set(bob, "delivered")).error?.message).toMatch(/not allowed/);
    });
    it("고객 취소 요청이 걸린 paid 건은 진행 거부", async () => {
      await svc!.from("proxy_requests").update({ cancel_requested_at: new Date().toISOString(), cancel_reason: "T8" }).eq("id", reqId);
      expect((await set(bob, "purchasing")).error?.message).toMatch(/customer requested cancel/);
      await svc!.from("proxy_requests").update({ cancel_requested_at: null, cancel_reason: null }).eq("id", reqId);
    });
    it("허용 전이는 저장되고 활동 기록이 남는다", async () => {
      const r = await set(bob, "purchasing", "현지 구매 시작");
      expect(r.error).toBeNull();
      expect((await statusNow()).status).toBe("purchasing");
      const a = await lastAction(reqId, "order_status");
      expect(a?.admin_id).toBe(bobId);
      expect(a?.detail).toMatchObject({ from: "paid", to: "purchasing", kind: "forward", note: "현지 구매 시작" });
    });
    it("되돌림은 메모가 있어야 한다", async () => {
      expect((await set(bob, "paid")).error?.message).toMatch(/note required/);
      expect((await set(bob, "paid", "잘못 누름")).error).toBeNull();
      expect((await statusNow()).status).toBe("paid");
    });
    it("국제 발송은 운송장을 남긴다", async () => {
      for (const to of ["purchasing", "center_received"]) expect((await set(bob, to)).error).toBeNull();
      expect((await set(bob, "shipped_international", "", "TRK-T8-1")).error).toBeNull();
      expect(await statusNow()).toMatchObject({ status: "shipped_international", intl_tracking: "TRK-T8-1" });
    });
    it("고객이 자기 항목 상태를 다시 읽으면 바뀐 상태가 보인다", async () => {
      const mine = await alice.from("proxy_requests").select("status").eq("id", reqId).single();
      expect(mine.data?.status).toBe("shipped_international");
    });
    it("허용 전이 표는 운영자만 읽고 돈 경계 행은 넣을 수 없다", async () => {
      expect((await alice.from("admin_order_transitions").select("from_status")).data).toHaveLength(0);
      expect(((await bob.from("admin_order_transitions").select("from_status")).data ?? []).length).toBeGreaterThan(0);
      const bad = await svc!.from("admin_order_transitions").insert({ from_status: "delivered", to_status: "completed", kind: "forward" });
      expect(bad.error?.code).toBe("23514");
    });
  });

  describe("admin_update_listing", () => {
    const upd = (c: SupabaseClient, title: string | null, price: number | null) =>
      c.rpc("admin_update_listing", { p_id: listingId, p_title: title, p_price: price, p_note: "T8" });

    it("운영자가 아니면 거부", async () => {
      expect((await upd(alice, "남의 수정", null)).error?.message).toContain("admin only");
    });
    it("제목·가격 수정이 저장되고 기록이 남는다", async () => {
      const r = await upd(bob, "T8 수정됨", 45000);
      expect(r.error).toBeNull();
      const l = (await alice.from("listings").select("title, price").eq("id", listingId).single()).data;
      expect(l).toEqual({ title: "T8 수정됨", price: 45000 });
      expect((await lastAction(listingId, "listing_update"))?.detail).toMatchObject({ title_from: "T8 수정 시험", title: "T8 수정됨", price_from: 50000, price: 45000 });
    });
    it("범위 밖·바뀐 것 없음은 거부", async () => {
      expect((await upd(bob, "가".repeat(81), null)).error?.message).toMatch(/too long/);
      expect((await upd(bob, null, -1)).error?.message).toMatch(/out of range/);
      expect((await upd(bob, null, 45000)).error?.message).toMatch(/nothing to change/);
    });
    it("진행 중 거래가 있으면 가격은 거부, 제목은 된다", async () => {
      const tx = await svc!.from("transactions").insert({
        listing_id: listingId, buyer_id: bobId, seller_id: aliceId, status: "paid", is_cross_border: false,
        item_price: 45000, intl_shipping_fee: 0, platform_fee: 0, currency: "KRW",
      }).select("id").single();
      if (tx.error) throw tx.error;
      txId = tx.data.id;
      expect((await upd(bob, null, 30000)).error?.message).toMatch(/active transaction/);
      expect((await alice.from("listings").select("price").eq("id", listingId).single()).data?.price).toBe(45000);
      expect((await upd(bob, "T8 거래 중 제목", null)).error).toBeNull();
    });
  });
});
