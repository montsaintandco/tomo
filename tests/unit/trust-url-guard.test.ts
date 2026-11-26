import { describe, it, expect } from "vitest";
import { isMarketImageUrl } from "../../lib/url-guard";

describe("isMarketImageUrl — 고객 스냅샷 이미지는 그 마켓 호스트만", () => {
  it("마켓 이미지 호스트 허용", () => {
    expect(isMarketImageUrl("mercari", "https://static.mercdn.net/item/detail/orig/photos/m1_1.jpg")).toBe(true);
    expect(isMarketImageUrl("yahoo_flea", "https://auc-pctr.c.yimg.jp/i/a.jpg")).toBe(true);
    expect(isMarketImageUrl("joongna", "https://img2.joongna.com/a.jpg")).toBe(true);
  });
  it("다른 마켓 호스트 거부", () => {
    expect(isMarketImageUrl("mercari", "https://auc-pctr.c.yimg.jp/i/a.jpg")).toBe(false);
    expect(isMarketImageUrl("daangn", "https://static.mercdn.net/a.jpg")).toBe(false);
  });
  it("점 경계가 아닌 접미사·http·포트·계정·IP 거부", () => {
    expect(isMarketImageUrl("mercari", "https://evilmercdn.net/a.jpg")).toBe(false);
    expect(isMarketImageUrl("mercari", "https://static.mercdn.net.evil.com/a.jpg")).toBe(false);
    expect(isMarketImageUrl("mercari", "http://static.mercdn.net/a.jpg")).toBe(false);
    expect(isMarketImageUrl("mercari", "https://static.mercdn.net:8443/a.jpg")).toBe(false);
    expect(isMarketImageUrl("mercari", "https://u:p@static.mercdn.net/a.jpg")).toBe(false);
    expect(isMarketImageUrl("mercari", "https://127.0.0.1/a.jpg")).toBe(false);
    expect(isMarketImageUrl("mercari", "https://[::1]/a.jpg")).toBe(false);
    expect(isMarketImageUrl("mercari", "javascript:alert(1)")).toBe(false);
    expect(isMarketImageUrl("mercari", "not a url")).toBe(false);
  });
});
