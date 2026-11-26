import { describe, it, expect } from "vitest";
import { budgetVerdict, dayStartIso } from "../../lib/ai-budget";

describe("AI 상담 하루 상한", () => {
  it("전체 상한이 IP 상한보다 먼저", () => {
    expect(budgetVerdict(0, 0, 300, 30)).toBe("ok");
    expect(budgetVerdict(299, 29, 300, 30)).toBe("ok");
    expect(budgetVerdict(300, 0, 300, 30)).toBe("cap");
    expect(budgetVerdict(10, 30, 300, 30)).toBe("ip");
    expect(budgetVerdict(300, 30, 300, 30)).toBe("cap");
  });
  it("하루 시작은 한국·일본 자정(UTC 15:00)", () => {
    expect(dayStartIso(new Date("2026-11-26T14:59:00Z"))).toBe("2026-11-25T15:00:00.000Z");
    expect(dayStartIso(new Date("2026-11-26T15:00:00Z"))).toBe("2026-11-26T15:00:00.000Z");
    expect(dayStartIso(new Date("2026-11-26T03:00:00Z"))).toBe("2026-11-25T15:00:00.000Z");
  });
});
