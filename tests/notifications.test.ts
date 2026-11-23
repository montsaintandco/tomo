import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { I18N_KEYS, t } from "../lib/i18n";
import { NOTIF_KINDS, notifHref, notifSub, notifText, pageLimit } from "../lib/notifications";

const n = (kind: string, ref_id: string | null = "r1", data: Record<string, unknown> = {}) => ({ kind, ref_id, data });

describe("notifications kind → 문구", () => {
  it("every kind has a translated i18n key", () => {
    for (const k of NOTIF_KINDS) {
      expect(I18N_KEYS, k).toContain(`notif.${k}`);
      expect(notifText("ko", { kind: k })).not.toBe(notifText("ja", { kind: k }));
    }
  });
  it("unknown kind falls back to a generic line", () => {
    expect(notifText("ko", { kind: "future_kind" })).toBe(t("ko", "my.notif.generic"));
  });
  it("0027 migration emits only kinds the app knows", () => {
    const sql = readFileSync("supabase/migrations/0027_notifications.sql", "utf8");
    const literal = [...sql.matchAll(/'((?:tx|proxy|support|refund|payout|offer|wish)_[a-z_]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith("_id")); // jsonb 키(proxy_request_id 등) 제외
    for (const k of literal) expect(NOTIF_KINDS as readonly string[], k).toContain(k);
    // 'offer_' || status, 'payout_' || status 로 만드는 kind
    for (const k of ["offer_accepted", "offer_declined", "payout_sent", "payout_rejected"]) expect(NOTIF_KINDS as readonly string[]).toContain(k);
  });
  it("sub line uses data.title", () => {
    expect(notifSub({ data: { title: "카메라" } })).toBe("카메라");
    expect(notifSub({ data: null })).toBe("");
  });
});

describe("notifications kind → 링크", () => {
  it("maps each kind to a destination", () => {
    expect(notifHref(n("tx_paid", "t1"))).toBe("/transactions/t1");
    expect(notifHref(n("tx_disputed", "t2"))).toBe("/transactions/t2");
    expect(notifHref(n("proxy_quoted", "p1"))).toBe("/proxy/p1");
    expect(notifHref(n("proxy_shipped", "p1", { order_id: "o1" }))).toBe("/order/o1");
    expect(notifHref(n("support_answered"))).toBe("/mypage/support");
    expect(notifHref(n("refund_done", "f1", { transaction_id: "t9" }))).toBe("/transactions/t9");
    expect(notifHref(n("refund_done", "f1", { proxy_request_id: "p9" }))).toBe("/proxy/p9");
    expect(notifHref(n("refund_done", "f1"))).toBe("/mypage/orders");
    expect(notifHref(n("payout_sent"))).toBe("/mypage/payouts");
    expect(notifHref(n("payout_rejected"))).toBe("/mypage/payouts");
    expect(notifHref(n("offer_received"))).toBe("/mypage/offers");
    expect(notifHref(n("offer_accepted", "of1", { listing_id: "l1" }))).toBe("/listings/l1");
    expect(notifHref(n("offer_declined"))).toBe("/mypage/offers?tab=out");
    expect(notifHref(n("wish_price_drop", "l2"))).toBe("/listings/l2");
    expect(notifHref(n("something_new"))).toBe("/mypage/notifications");
  });
  it("every kind resolves to an in-site path", () => {
    for (const k of NOTIF_KINDS) expect(notifHref(n(k))).toMatch(/^\/[a-z]/);
  });
});

describe("pageLimit", () => {
  it("20 per page, clamped", () => {
    expect(pageLimit(undefined)).toEqual({ n: 1, limit: 20 });
    expect(pageLimit("3")).toEqual({ n: 3, limit: 60 });
    expect(pageLimit("-1").n).toBe(1);
    expect(pageLimit("abc").n).toBe(1);
    expect(pageLimit("999").n).toBe(50);
  });
});
