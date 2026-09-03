import { describe, it, expect } from "vitest";
import { isRetryableStatus, backoffMs } from "../lib/market/http";
import { LIVE_SOURCES, SOURCE_LABEL, SOURCE_CURRENCY } from "../lib/market/types";

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
  it("has all four markets live-parseable", () => {
    expect(LIVE_SOURCES).toEqual(["mercari", "yahoo_auction", "daangn", "joongna"]);
  });

  it("maps each source to its market currency (drives search language)", () => {
    expect(SOURCE_CURRENCY.mercari).toBe("JPY");
    expect(SOURCE_CURRENCY.yahoo_auction).toBe("JPY");
    expect(SOURCE_CURRENCY.daangn).toBe("KRW");
    expect(SOURCE_CURRENCY.joongna).toBe("KRW");
  });

  it("labels every source", () => {
    for (const s of LIVE_SOURCES) expect(SOURCE_LABEL[s]).toBeTruthy();
  });
});

import { parseMarketUrl } from "../lib/market/url";

describe("market url paste (SAZO식)", () => {
  it("resolves supported product urls to source + id", () => {
    expect(parseMarketUrl("https://jp.mercari.com/item/m12345678901")).toEqual({ source: "mercari", id: "m12345678901" });
    expect(parseMarketUrl("https://auctions.yahoo.co.jp/jp/auction/x1234567890")).toEqual({ source: "yahoo_auction", id: "x1234567890" });
    expect(parseMarketUrl("https://www.daangn.com/kr/buy-sell/필름카메라-123456789/")).toEqual({ source: "daangn", id: "123456789" });
    expect(parseMarketUrl("https://web.joongna.com/product/987654321")).toEqual({ source: "joongna", id: "987654321" });
  });
  it("ignores keywords and unsupported urls", () => {
    expect(parseMarketUrl("필름카메라")).toBeNull();
    expect(parseMarketUrl("https://www.amazon.co.jp/dp/B000000")).toBeNull();
  });
});
