import { describe, it, expect } from "vitest";
import { isRetryableStatus, backoffMs } from "../lib/market/http";
import { LIVE_SOURCES, SOURCE_LABEL } from "../lib/market/types";

describe("market http retry policy", () => {
  it("retries only transient statuses", () => {
    for (const s of [408, 425, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [200, 301, 400, 401, 403, 404]) expect(isRetryableStatus(s)).toBe(false);
  });

  it("backs off exponentially with a cap", () => {
    expect(backoffMs(1)).toBe(300);
    expect(backoffMs(2)).toBe(600);
    expect(backoffMs(3)).toBe(1200);
    expect(backoffMs(99)).toBe(4000); // cap
  });
});

describe("market sources", () => {
  it("marks only japan sources as live-parseable", () => {
    expect(LIVE_SOURCES).toEqual(["mercari", "yahoo_auction"]);
    // 한국 소스는 라벨은 있으나 실파싱 미지원 (어드민 수동 등록으로 커버)
    expect(SOURCE_LABEL.daangn).toBe("당근마켓");
    expect(LIVE_SOURCES).not.toContain("daangn");
    expect(LIVE_SOURCES).not.toContain("joongna");
  });
});
