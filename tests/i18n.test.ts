import { describe, it, expect } from "vitest";
import { I18N_KEYS, t } from "../lib/i18n";

describe("i18n dictionary", () => {
  it("has non-empty ko and ja for every key", () => {
    for (const k of I18N_KEYS) {
      expect(t("ko", k).trim(), k).not.toBe("");
      expect(t("ja", k).trim(), k).not.toBe("");
    }
  });
  it("ja strings are not just the ko string (actually translated)", () => {
    const same = I18N_KEYS.filter((k) => t("ko", k) === t("ja", k));
    expect(same).toEqual([]);
  });
  it("substitutes variables in both languages", () => {
    expect(t("ko", "hub.trending", { market: "일본" })).toBe("일본에서 지금 인기");
    expect(t("ja", "hub.trending", { market: "韓国" })).toBe("韓国で今人気");
    expect(t("ja", "feed.cap", { n: 40 })).toBe("最新40件まで表示しています");
  });
  it("leaves no unfilled placeholders when vars are supplied", () => {
    expect(t("ko", "hub.sell", { other: "일본", mine: "한국" })).not.toMatch(/\{/);
    expect(t("ja", "hub.sellSub", { other: "韓国" })).not.toMatch(/\{/);
  });
});
