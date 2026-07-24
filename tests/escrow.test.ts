import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

// paid 이후 해피패스(센터 admin 전이·수령확인·후기·신뢰온도)는 mark_paid가 service_role
// 전용이라 vitest에서 결제 상태에 도달할 수 없어, SQL 역할 임퍼소네이션으로 별도 증명됨
// (마이그레이션 검증 단계). 여기서는 인증 사용자가 실제 도달 가능한 표면 + RLS/권한을 검증한다.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
let alice: SupabaseClient, bob: SupabaseClient;
let aliceId: string, bobId: string;
let bobListingId: string;
let cancelledTxId: string;

beforeAll(async () => {
  alice = createClient(url, anonKey, { auth: { persistSession: false } });
  bob = createClient(url, anonKey, { auth: { persistSession: false } });
  const a = await alice.auth.signInWithPassword({
    email: "tomo.test.alice@gmail.com", password: "test-pass-1234" });
  const b = await bob.auth.signInWithPassword({
    email: "tomo.test.bob@gmail.com", password: "test-pass-1234" });
  if (a.error || b.error) throw a.error ?? b.error;
  aliceId = a.data.user!.id; bobId = b.data.user!.id;

  const { data: l } = await bob.from("listings")
    .select("id").eq("seller_id", bobId).eq("cross_border_enabled", true)
    .eq("status", "active").limit(1).single();
  // 자가치유: 이전 실행이 남긴 예약/미결제 거래를 취소해 listing을 active로 되돌림
  if (!l) {
    const { data: reserved } = await bob.from("listings")
      .select("id").eq("seller_id", bobId).eq("cross_border_enabled", true).limit(1).single();
    bobListingId = reserved!.id;
  } else {
    bobListingId = l.id;
  }
  const { data: stale } = await alice.from("transactions")
    .select("id, status").eq("listing_id", bobListingId).eq("buyer_id", aliceId)
    .eq("status", "pending_payment");
  for (const t of stale ?? []) {
    await alice.rpc("advance_transaction", { p_tx_id: t.id, p_to: "cancelled" });
  }
});

describe("escrow RLS + state machine", () => {
  it("anon cannot start a transaction", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc("start_transaction", {
      p_listing_id: bobListingId, p_intl_shipping_fee: 0 });
    expect(error).not.toBeNull();
  });

  it("cannot buy own listing", async () => {
    const { error } = await bob.rpc("start_transaction", {
      p_listing_id: bobListingId, p_intl_shipping_fee: 0 });
    expect(error).not.toBeNull();
  });

  it("start reserves listing, computes cross-border fee/center; guards, then buyer cancels", async () => {
    const { data: tx, error } = await alice.rpc("start_transaction", {
      p_listing_id: bobListingId, p_intl_shipping_fee: 3000 });
    expect(error).toBeNull();
    expect(tx.is_cross_border).toBe(true);
    expect(tx.center).toBe("NARITA");           // bob = JP 판매자
    expect(tx.platform_fee).toBe(Math.floor(tx.item_price * 0.1));
    expect(tx.intl_shipping_fee).toBe(3000);
    expect(tx.status).toBe("pending_payment");

    // 예약됨
    const { data: ls } = await alice.from("listings").select("status").eq("id", bobListingId).single();
    expect(ls!.status).toBe("reserved");

    // 이미 예약된 상품 재결제 거부(조건부 예약 선점)
    const dup = await alice.rpc("start_transaction", { p_listing_id: bobListingId, p_intl_shipping_fee: 0 });
    expect(dup.error).not.toBeNull();

    // attach_payment_intent: 비구매자(bob) 거부, 구매자(alice) 성공
    const badAttach = await bob.rpc("attach_payment_intent", {
      p_tx_id: tx.id, p_payment_intent_id: "pi_x" });
    expect(badAttach.error).not.toBeNull();
    const okAttach = await alice.rpc("attach_payment_intent", {
      p_tx_id: tx.id, p_payment_intent_id: "pi_test_" + tx.id });
    expect(okAttach.error).toBeNull();

    // 불법 전이: 미결제 상태에서 발송/결제/완료 시도 모두 거부
    const illegal1 = await alice.rpc("advance_transaction", { p_tx_id: tx.id, p_to: "shipped" });
    expect(illegal1.error).not.toBeNull();
    const illegal2 = await alice.rpc("advance_transaction", { p_tx_id: tx.id, p_to: "paid" });
    expect(illegal2.error).not.toBeNull();
    const illegal3 = await bob.rpc("advance_transaction", { p_tx_id: tx.id, p_to: "shipped_to_center" });
    expect(illegal3.error).not.toBeNull();

    // 구매자 취소 -> 상품 다시 active
    const cancel = await alice.rpc("advance_transaction", { p_tx_id: tx.id, p_to: "cancelled" });
    expect(cancel.error).toBeNull();
    const { data: ls2 } = await alice.from("listings").select("status").eq("id", bobListingId).single();
    expect(ls2!.status).toBe("active");
    cancelledTxId = tx.id;
  });

  it("direct writes to transactions are blocked (functions only)", async () => {
    const upd = await alice.from("transactions")
      .update({ status: "paid" }).eq("id", cancelledTxId).select();
    // 권한 회수: 에러이거나 0행 (RLS/grant로 차단)
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);

    const ins = await alice.from("transactions").insert({
      listing_id: bobListingId, buyer_id: aliceId, seller_id: bobId,
      is_cross_border: false, item_price: 1, currency: "KRW",
    });
    expect(ins.error).not.toBeNull();
  });

  it("submit_review rejected on non-completed tx and for anon", async () => {
    const notDone = await alice.rpc("submit_review", {
      p_tx_id: cancelledTxId, p_rating: 5, p_comment: "x" });
    expect(notDone.error).not.toBeNull(); // tx not completed

    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const anonReview = await anon.rpc("submit_review", {
      p_tx_id: cancelledTxId, p_rating: 5, p_comment: "x" });
    expect(anonReview.error).not.toBeNull();
  });
});
