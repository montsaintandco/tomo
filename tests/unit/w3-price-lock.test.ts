import { describe, it, expect } from "vitest";
import { priceLock, PRICE_LOCK_ERR } from "../../app/api/listings/price-lock";
import { t } from "../../lib/i18n";

describe("판매자 가격 잠금 규칙 (0037 admin_update_listing 과 같음)", () => {
  it("예약중이면 거래 수와 상관없이 잠긴다", () => {
    expect(priceLock("reserved", 0)).toBe("reserved");
    expect(priceLock("reserved", null)).toBe("reserved");
  });
  it("진행 중 거래가 있으면 잠긴다(판매완료 상태 포함)", () => {
    expect(priceLock("active", 1)).toBe("activeTx");
    expect(priceLock("sold", 2)).toBe("activeTx");
  });
  it("거래가 없으면 풀린다", () => {
    expect(priceLock("active", 0)).toBeNull();
  });
  it("거래 조회 실패면 안전 쪽(잠금)", () => {
    expect(priceLock("active", null)).toBe("unknown");
  });
  it("잠금 사유마다 한국어·일본어 문구가 있다", () => {
    for (const key of Object.values(PRICE_LOCK_ERR)) {
      expect(t("ko", key)).not.toBe(key);
      expect(t("ja", key)).toMatch(/[ぁ-んァ-ン一-龥]/);
    }
  });
});
