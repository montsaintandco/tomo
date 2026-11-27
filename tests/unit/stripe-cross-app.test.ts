import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { settleSession } from "../../lib/stripe-settle";
import { APP_TAG } from "../../lib/stripe";

// 같은 Stripe 계정을 에어쉽과 함께 쓴다(설계 12 · 3.4). tomo 결제가 아닌 세션은 DB·Stripe 를 한 번도 부르지 않고 무시해야 한다.
const boom = () => { throw new Error("must not be called"); };
const stripe = new Proxy({}, { get: boom }) as unknown as Stripe;
const admin = new Proxy({}, { get: boom }) as unknown as SupabaseClient;
const session = (metadata: Record<string, string> | null) =>
  ({ id: "cs_test_x", metadata, payment_status: "paid", payment_intent: "pi_x" }) as unknown as Stripe.Checkout.Session;

describe("Stripe 웹훅 교차 수신 가드", () => {
  it("에어쉽 등 다른 앱의 세션은 아무것도 하지 않는다", async () => {
    expect(await settleSession(stripe, admin, session({ order_id: "J000123", kind: "tx", id: "00000000-0000-0000-0000-000000000000" }))).toBeNull();
    expect(await settleSession(stripe, admin, session({ app: "airship", kind: "po", id: "x" }))).toBeNull();
    expect(await settleSession(stripe, admin, session(null))).toBeNull();
  });
  it("tomo 표시가 있어도 종류·id 가 없으면 무시한다", async () => {
    expect(await settleSession(stripe, admin, session({ app: APP_TAG, kind: "voucher", id: "x" }))).toBeNull();
    expect(await settleSession(stripe, admin, session({ app: APP_TAG, kind: "tx" }))).toBeNull();
  });
});
