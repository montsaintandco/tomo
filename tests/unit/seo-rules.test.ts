import { describe, it, expect } from "vitest";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { SITE_URL } from "../../lib/site";
import { websiteJsonLd, langAlternates } from "../../lib/seo";
import { HELP_C } from "../../lib/help-faq";
import { GREETING } from "../../lib/support-tree";

// 구글 robots 규칙: 가장 긴 일치 규칙이 이긴다(같으면 allow). `*` = 아무 글자, `$` = 끝.
function allowed(path: string, allow: string[], disallow: string[]): boolean {
  const re = (r: string) => new RegExp("^" + r.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  const best = (rs: string[]) => Math.max(-1, ...rs.filter((r) => re(r).test(path)).map((r) => r.length));
  return best(allow) >= best(disallow);
}

describe("robots", () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  const allow = [rule.allow ?? []].flat(), disallow = [rule.disallow ?? []].flat();
  const ok = (p: string) => allowed(p, allow, disallow);

  it("상품 상세·정적 페이지·언어 변형은 허용", () => {
    for (const p of ["/", "/listings/0b7c1f2e-1234", "/listings/abc?lang=ja", "/global", "/global?lang=ja", "/global?source=mercari", "/guide", "/help?lang=ja", "/terms", "/categories", "/travel", "/?cat=figure", "/sitemap.xml", "/llms.txt"]) expect(ok(p), p).toBe(true);
  });
  it("검색 결과(?q=)는 차단 — 첫 파라미터든 중간이든", () => {
    for (const p of ["/global?q=pokemon", "/global?lang=ja&q=x", "/global?source=mercari&q=x&sort=new", "/?q=camera", "/?tab=all&q=x"]) expect(ok(p), p).toBe(false);
  });
  it("개인 화면·API·외부 상품 상세는 차단", () => {
    for (const p of ["/admin", "/mypage/orders", "/api/listings", "/cart", "/global/mercari/m123", "/order/1"]) expect(ok(p), p).toBe(false);
  });
  it("이름에 q 가 든 다른 파라미터는 막지 않는다", () => {
    expect(ok("/?faq=1")).toBe(true);
    expect(ok("/global?qty=1")).toBe(true);
  });
  it("사이트맵 주소는 운영 도메인", () => {
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("site", () => {
  it("기본값에 옛 Vercel 주소가 없다", () => {
    if (!process.env.NEXT_PUBLIC_SITE_URL) expect(SITE_URL).toBe("https://tomo.airship.click");
    expect(SITE_URL).not.toMatch(/vercel\.app/);
  });
});

describe("sitemap", () => {
  it("정적 페이지 lastmod 가 요청마다 바뀌지 않는다", async () => {
    const a = await sitemap();
    await new Promise((res) => setTimeout(res, 5));
    const b = await sitemap();
    const stat = (s: typeof a) => s.filter((e) => !e.url.includes("/listings/")).map((e) => [e.url, String(e.lastModified)]);
    expect(stat(a)).toEqual(stat(b));
    for (const e of a) {
      expect(e.url.startsWith(SITE_URL)).toBe(true);
      expect(new Date(e.lastModified!).getTime()).toBeLessThanOrEqual(Date.now());
    }
  });
  it("검색 결과·외부 상품 상세는 사이트맵에 없다", async () => {
    for (const e of await sitemap()) expect(e.url).not.toMatch(/\?q=|\/global\//);
  });
});

describe("seo helpers", () => {
  it("WebSite JSON-LD", () => {
    expect(websiteJsonLd()).toMatchObject({ "@type": "WebSite", name: "TOMO", url: `${SITE_URL}/` });
  });
  it("langAlternates 시그니처·출력 유지", () => {
    expect(langAlternates("/listings/1", "ja")).toEqual({ canonical: "/listings/1?lang=ja", languages: { ko: "/listings/1", ja: "/listings/1?lang=ja", "x-default": "/listings/1" } });
  });
});

describe("고객센터", () => {
  it("FAQ 가 ko·ja 같은 개수로 있다", () => {
    expect(HELP_C.ko.faq.length).toBeGreaterThan(5);
    expect(HELP_C.ja.faq.length).toBe(HELP_C.ko.faq.length);
  });
  it("봇 인사에 이모지가 없다", () => {
    expect(GREETING.flat().join("")).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});