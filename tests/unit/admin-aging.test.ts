import { describe, it, expect } from "vitest";
import { agingLevel, ageText, rankTurn, DEFAULT_AGING, PROXY_STAGE, type TurnItem } from "../../lib/admin-aging";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 36e5).toISOString();

describe("agingLevel — 단계별 주의·지연 경계", () => {
  it("경계 직전은 그 아래 등급, 경계부터 올라간다", () => {
    const { warn_h, late_h } = DEFAULT_AGING.purchase;
    expect(agingLevel(hoursAgo(warn_h - 0.1), "purchase", NOW)).toBeNull();
    expect(agingLevel(hoursAgo(warn_h), "purchase", NOW)).toBe("warn");
    expect(agingLevel(hoursAgo(late_h - 0.1), "purchase", NOW)).toBe("warn");
    expect(agingLevel(hoursAgo(late_h), "purchase", NOW)).toBe("late");
  });
  it("시각이 없거나 깨지면 판정하지 않는다", () => {
    expect(agingLevel(null, "refund", NOW)).toBeNull();
    expect(agingLevel("not-a-date", "refund", NOW)).toBeNull();
  });
  it("주의 기준이 지연 기준보다 크게 잘못 들어와도 지연이 먼저 판정된다", () => {
    const th = { ...DEFAULT_AGING, quote: { warn_h: 50, late_h: 10 } };
    expect(agingLevel(hoursAgo(11), "quote", NOW, th)).toBe("late");
    expect(agingLevel(hoursAgo(9), "quote", NOW, th)).toBeNull();
  });
});

describe("ageText", () => {
  it("방금 / N시간 / N일", () => {
    expect(ageText(hoursAgo(0.5), NOW)).toBe("방금");
    expect(ageText(hoursAgo(5), NOW)).toBe("5시간");
    expect(ageText(hoursAgo(49), NOW)).toBe("2일");
    expect(ageText(null, NOW)).toBe("");
  });
});

describe("PROXY_STAGE — 고객·택배 차례인 상태는 운영자 큐에 안 들어간다", () => {
  it("운영자 처리 단계만 매핑", () => {
    expect(Object.keys(PROXY_STAGE).sort()).toEqual(["approved", "center_received", "paid", "purchasing", "requested"]);
    for (const s of ["quoted", "shipped_international", "delivered", "completed", "cancelled"]) expect(PROXY_STAGE[s]).toBeUndefined();
  });
});

describe("rankTurn — 지연 > 주의 > 보통, 같은 등급은 오래된 순, 중복 제거", () => {
  it("정렬과 중복 제거", () => {
    const items: TurnItem[] = [
      { key: "a", stage: "refund", title: "새 환불", since: hoursAgo(0.1), href: "/" },        // 보통
      { key: "b", stage: "purchase", title: "구매 지연", since: hoursAgo(60), href: "/" },     // 지연
      { key: "c", stage: "support", title: "문의 주의", since: hoursAgo(13), href: "/" },      // 주의
      { key: "d", stage: "report", title: "신고 지연", since: hoursAgo(100), href: "/" },      // 지연(더 오래됨)
      { key: "b", stage: "purchase", title: "중복", since: hoursAgo(1), href: "/" },
    ];
    const r = rankTurn(items, NOW);
    expect(r.map((x) => x.key)).toEqual(["d", "b", "c", "a"]);
    expect(r.map((x) => x.level)).toEqual(["late", "late", "warn", null]);
  });
});
