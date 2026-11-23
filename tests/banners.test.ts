import { describe, it, expect } from "vitest";
import { liveBannersFor, isLive, bannerState, dayToIso, isoToDay, linkError, bannerLink, bannerAlt, fileError, periodLabel } from "../lib/banners";

const NOW = Date.parse("2026-11-23T03:00:00Z"); // KST 12:00
const b = (o: Partial<{ id: string; audience: "KR" | "JP" | "ALL"; is_active: boolean; starts_at: string | null; ends_at: string | null; sort_order: number; created_at: string }>) => ({
  id: "x", audience: "ALL" as const, is_active: true, starts_at: null, ends_at: null, sort_order: 0, created_at: "2026-11-01T00:00:00Z", ...o,
});

describe("banner period", () => {
  it("half-open [starts_at, ends_at)", () => {
    expect(isLive(b({ starts_at: "2026-11-23T03:00:00Z" }), NOW)).toBe(true);
    expect(isLive(b({ ends_at: "2026-11-23T03:00:00Z" }), NOW)).toBe(false);
    expect(bannerState(b({ starts_at: "2026-11-24T00:00:00Z" }), NOW)).toBe("예약");
    expect(bannerState(b({ ends_at: "2026-11-22T00:00:00Z" }), NOW)).toBe("종료");
    expect(bannerState(b({ is_active: false }), NOW)).toBe("꺼짐");
    expect(bannerState(b({}), NOW)).toBe("노출 중");
  });
  it("date input ↔ ISO in KST, end day inclusive", () => {
    expect(dayToIso("2026-11-23", "start")).toBe("2026-11-22T15:00:00.000Z");
    expect(dayToIso("2026-11-23", "end")).toBe("2026-11-23T15:00:00.000Z");
    expect(dayToIso("2026/11/23", "start")).toBeNull();
    expect(isoToDay("2026-11-23T15:00:00.000Z", "end")).toBe("2026-11-23");
    expect(isoToDay("2026-11-22T15:00:00.000Z", "start")).toBe("2026-11-23");
    expect(isoToDay(null, "start")).toBe("");
    // 오늘 하루짜리 배너는 KST 오늘 정오에 노출 중
    expect(isLive(b({ starts_at: dayToIso("2026-11-23", "start"), ends_at: dayToIso("2026-11-23", "end") }), NOW)).toBe(true);
    expect(periodLabel(b({ starts_at: dayToIso("2026-11-23", "start"), ends_at: dayToIso("2026-11-30", "end") }))).toBe("26.11.23 ~ 26.11.30");
    expect(periodLabel(b({}))).toBe("상시");
  });
});

describe("banner audience filter", () => {
  const list = [
    b({ id: "jp", audience: "JP", sort_order: 1 }),
    b({ id: "all2", audience: "ALL", sort_order: 5 }),
    b({ id: "kr", audience: "KR", sort_order: 3 }),
    b({ id: "off", audience: "ALL", is_active: false }),
    b({ id: "future", audience: "KR", starts_at: "2026-12-01T00:00:00Z" }),
    b({ id: "all1", audience: "ALL", sort_order: 3, created_at: "2026-10-01T00:00:00Z" }),
  ];
  it("KR viewer gets KR + ALL, live only, by sort_order then created_at", () => {
    expect(liveBannersFor(list, "KR", NOW).map((x) => x.id)).toEqual(["all1", "kr", "all2"]);
  });
  it("JP viewer gets JP + ALL", () => {
    expect(liveBannersFor(list, "JP", NOW).map((x) => x.id)).toEqual(["jp", "all1", "all2"]);
  });
  it("empty in → empty out", () => {
    expect(liveBannersFor([], "KR", NOW)).toEqual([]);
  });
});

describe("banner link & file", () => {
  it("accepts site paths and https only", () => {
    expect(linkError("")).toBeNull();
    expect(linkError("/global?q=x")).toBeNull();
    expect(linkError("https://example.com/a")).toBeNull();
    expect(linkError("//evil.com")).not.toBeNull();
    expect(linkError("/\\evil.com")).not.toBeNull();
    expect(linkError("http://example.com")).not.toBeNull();
    expect(linkError("javascript:alert(1)")).not.toBeNull();
    expect(bannerLink("/guide")).toEqual({ href: "/guide", internal: true });
    expect(bannerLink("https://a.com")).toEqual({ href: "https://a.com", internal: false });
    expect(bannerLink("//evil.com")).toBeNull();
    expect(bannerLink(null)).toBeNull();
  });
  it("alt falls back to ko", () => {
    expect(bannerAlt({ alt_ko: "가", alt_ja: "" }, "ja")).toBe("가");
    expect(bannerAlt({ alt_ko: "가", alt_ja: "ア" }, "ja")).toBe("ア");
  });
  it("file type and size", () => {
    expect(fileError({ type: "image/webp", size: 1000 })).toBeNull();
    expect(fileError({ type: "image/gif", size: 1000 })).not.toBeNull();
    expect(fileError({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
  });
});
