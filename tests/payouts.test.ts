import { describe, it, expect } from "vitest";
import { ledgerBalances, payoutAmountError, normalizeAccount, payoutErrorKey, maskAccount, signed, LEDGER_KIND_KEY, PAYOUT_STATUS_KEY } from "../lib/payouts";
import { sellerPayout } from "../lib/fees";
import { t } from "../lib/i18n";

describe("payouts ledger", () => {
  it("balance = sum of ledger per currency (sale, hold, release, adjust)", () => {
    const sale = sellerPayout(10000); // 9000
    const b = ledgerBalances([
      { currency: "KRW", amount: sale },
      { currency: "KRW", amount: -5000 },  // payout_hold
      { currency: "KRW", amount: 5000 },   // payout_release (반려)
      { currency: "KRW", amount: -1000 },  // adjust
      { currency: "JPY", amount: sellerPayout(1999) }, // 1999 - 199
    ]);
    expect(b).toEqual({ KRW: 8000, JPY: 1800 });
  });
  it("empty ledger is zero for both currencies", () => {
    expect(ledgerBalances([])).toEqual({ KRW: 0, JPY: 0 });
  });
});

describe("payout amount / account validation", () => {
  it("rejects non-integer, zero, negative and over-balance", () => {
    expect(payoutAmountError(0, 100)).toBe("payout.err.amount");
    expect(payoutAmountError(-1, 100)).toBe("payout.err.amount");
    expect(payoutAmountError(1.5, 100)).toBe("payout.err.amount");
    expect(payoutAmountError(Number.NaN, 100)).toBe("payout.err.amount");
    expect(payoutAmountError(101, 100)).toBe("payout.err.balance");
    expect(payoutAmountError(100, 100)).toBeNull();
  });
  it("normalizes account and matches DB check", () => {
    expect(normalizeAccount({ bank_name: " 국민 ", account_number: "123 456-78", account_holder: " 홍길동 " }))
      .toEqual({ ok: true, value: { bank_name: "국민", account_number: "123456-78", account_holder: "홍길동" } });
    expect(normalizeAccount({ bank_name: "국민", account_number: "12a4", account_holder: "홍" }).ok).toBe(false);
    expect(normalizeAccount({ bank_name: "", account_number: "1234", account_holder: "홍" }).ok).toBe(false);
    expect(normalizeAccount({ bank_name: "국민", account_number: "123", account_holder: "홍" }).ok).toBe(false);
  });
});

describe("payout display", () => {
  it("maps DB errors to i18n keys", () => {
    expect(payoutErrorKey("insufficient balance")).toBe("payout.err.balance");
    expect(payoutErrorKey("payout already requested")).toBe("payout.err.pending");
    expect(payoutErrorKey("no payout account")).toBe("payout.err.account");
    expect(payoutErrorKey("boom")).toBe("payout.err.generic");
    expect(payoutErrorKey(undefined)).toBe("payout.err.generic");
  });
  it("masks account and signs amounts", () => {
    expect(maskAccount("123-456-7890")).toBe("•••• 7890");
    expect(maskAccount("123")).toBe("123");
    expect(signed(-1000, (n) => `${n}원`)).toBe("−1000원");
    expect(signed(500, (n) => `${n}원`)).toBe("+500원");
  });
  it("every kind/status has a translated label", () => {
    for (const k of [...Object.values(LEDGER_KIND_KEY), ...Object.values(PAYOUT_STATUS_KEY)]) {
      expect(t("ko", k)).not.toBe(t("ja", k));
    }
    expect(t("ko", "payout.confirm", { amount: "1,000원", bank: "국민" })).not.toMatch(/\{/);
  });
});
