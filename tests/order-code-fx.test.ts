import { describe, expect, it } from "vitest";
import { parseOrderCode, orderLabel } from "../lib/order-code";
import { decideRate } from "../lib/fx-refresh";
import { NOTIF_KINDS } from "../lib/notifications";
import { t, type I18nKey } from "../lib/i18n";

describe("parseOrderCode", () => {
  it("대행 T·거래 TX 를 6자리로 맞춘다", () => {
    expect(parseOrderCode("t12")).toEqual({ kind: "po", code: "T000012" });
    expect(parseOrderCode(" TX 000034 ")).toEqual({ kind: "tx", code: "TX000034" });
    expect(parseOrderCode("#T000001")).toEqual({ kind: "po", code: "T000001" });
    expect(parseOrderCode("T1234567")).toEqual({ kind: "po", code: "T1234567" });
  });
  it("번호가 아니면 null", () => {
    for (const s of ["", "12", "T", "T0", "TXY1", "abc", null, undefined]) expect(parseOrderCode(s)).toBeNull();
  });
  it("번호가 없으면 uuid 앞 8자리", () => {
    expect(orderLabel(null, "d28a4bb1-0000")).toBe("d28a4bb1");
    expect(orderLabel("T000005", "x")).toBe("T000005");
  });
});

describe("decideRate", () => {
  it("3% 안이면 적용, 엔→원은 에어쉽과 같은 가산, 원→엔은 고시환율 역수", () => {
    const d = decideRate(8.36, 8.9);
    expect(d.hold).toBe(false);
    expect(d.jpyKrw).toBe(8.8616);
    expect(d.krwJpy).toBeCloseTo(1 / 8.36, 6);
  });
  it("3% 넘게 바뀌면 보류(오르든 내리든)", () => {
    expect(decideRate(8.0, 9.0).hold).toBe(true);
    expect(decideRate(8.8, 9.0).hold).toBe(true);
    expect(decideRate(8.36, 9.0).hold).toBe(false);
  });
  it("지금 값이 없으면 비교 없이 적용", () => {
    expect(decideRate(8.36, null)).toMatchObject({ hold: false, change: null });
  });
});

describe("알림 문구", () => {
  it("모든 kind 에 ko·ja 문구가 있다", () => {
    for (const k of NOTIF_KINDS) for (const l of ["ko", "ja"] as const) {
      const s = t(l, `notif.${k}` as I18nKey);
      expect(s && s !== `notif.${k}`).toBeTruthy();
    }
  });
});
