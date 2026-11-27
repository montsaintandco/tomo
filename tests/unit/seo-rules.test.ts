import { describe, it, expect } from "vitest";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import { SITE_URL } from "../../lib/site";
import { websiteJsonLd, langAlternates, pageMeta, directFeeText } from "../../lib/seo";
import { isFlagOffPath, isMissingDetail } from "../../proxy";
import { PLATFORM_FEE_RATE } from "../../lib/fees";
import { GUIDE_C } from "../../lib/guide-content";
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
    for (const p of ["/", "/listings/0b7c1f2e-1234", "/listings/abc?lang=ja", "/global", "/global?lang=ja", "/global?source=mercari", "/guide", "/help?lang=ja", "/terms", "/categories", "/travel", "/?cat=figure", "/sitemap.xml", "/llms.txt", "/global/mercari/m123", "/global/yahoo_flea/z1?lang=ja"]) expect(ok(p), p).toBe(true);
  });
  it("검색 결과(?q=)는 차단 — 첫 파라미터든 중간이든", () => {
    for (const p of ["/global?q=pokemon", "/global?lang=ja&q=x", "/global?source=mercari&q=x&sort=new", "/?q=camera", "/?tab=all&q=x"]) expect(ok(p), p).toBe(false);
  });
  it("개인 화면·API·주문·프로필은 차단", () => {
    for (const p of ["/admin", "/mypage/orders", "/api/listings", "/cart", "/order/1", "/profile/abc"]) expect(ok(p), p).toBe(false);
  });
  it("이름에 q 가 든 다른 파라미터는 막지 않는다", () => {
    expect(ok("/?faq=1")).toBe(true);
    expect(ok("/global?qty=1")).toBe(true);
  });
  it("사이트맵 주소는 운영 도메인, 비표준 Host 없음", () => {
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(r.host).toBeUndefined();
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
describe("pageMeta 언어별 메타", () => {
  it("ja 는 일본어 제목·설명·og, canonical 은 ?lang=ja", () => {
    const m = pageMeta("/guide", "guide", "ja");
    expect(String(m.title)).toMatch(/[ぁ-んァ-ン]/);
    expect(String(m.description)).toMatch(/[ぁ-んァ-ン]/);
    expect(m.alternates?.canonical).toBe("/guide?lang=ja");
    expect(m.openGraph).toMatchObject({ locale: "ja_JP", title: `${m.title} | TOMO` });
    expect(JSON.stringify(m.openGraph)).toContain("/opengraph-image");
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });
  it("ko 는 한국어, 제목에 TOMO 를 직접 넣지 않는다(템플릿과 중복 방지)", () => {
    const m = pageMeta("/help", "help", "ko");
    expect(String(m.title)).toMatch(/[가-힣]/);
    expect(String(m.title)).not.toMatch(/TOMO/);
    expect(m.alternates?.canonical).toBe("/help");
  });
  it("홈은 템플릿 없이 절대 제목", () => {
    expect(pageMeta("/", "home", "ko").title).toMatchObject({ absolute: expect.stringContaining("TOMO") });
  });
});

describe("직거래 수수료 문장", () => {
  it("코드 상수 값을 쓰고 가이드·고객센터 FAQ 에 같은 문장이 있다", () => {
    const pct = `${Math.round(PLATFORM_FEE_RATE * 100)}%`;
    for (const lang of ["ko", "ja"] as const) {
      expect(directFeeText(lang)).toContain(pct);
      expect(GUIDE_C[lang].faq.map((f) => f[1])).toContain(directFeeText(lang));
      expect(HELP_C[lang].faq.map((f) => f[1])).toContain(directFeeText(lang));
    }
  });
});

describe("없는 상세 주소 404 판정(proxy)", () => {
  const id = "00000000-0000-0000-0000-000000000000";
  const base = { rsc: false, hasSession: false, exists: async () => false as boolean | null };
  it("카테고리 slug 는 목록으로 판정", async () => {
    expect(await isMissingDetail("/categories/zzz", base)).toBe(true);
    expect(await isMissingDetail("/categories/figure", base)).toBe(false);
  });
  it("상품·프로필: uuid 아니면 404, 없으면 404, 있으면 통과, 조회 오류는 통과", async () => {
    expect(await isMissingDetail("/listings/x1", base)).toBe(true);
    expect(await isMissingDetail(`/listings/${id}`, base)).toBe(true);
    expect(await isMissingDetail(`/listings/${id}`, { ...base, exists: async () => true })).toBe(false);
    expect(await isMissingDetail(`/listings/${id}`, { ...base, exists: async () => null })).toBe(false);
    expect(await isMissingDetail("/profile/me", base)).toBe(false);
    expect(await isMissingDetail("/profile/x1", base)).toBe(true);
  });
  it("주문은 uuid 아니면 404, 비로그인 uuid 는 판정하지 않는다(로그인으로 보냄), RSC 는 조회를 건너뛴다", async () => {
    expect(await isMissingDetail("/order/x1", base)).toBe(true);
    expect(await isMissingDetail(`/order/${id}`, base)).toBe(false);
    expect(await isMissingDetail(`/order/${id}`, { ...base, hasSession: true })).toBe(true);
    expect(await isMissingDetail(`/listings/${id}`, { ...base, rsc: true })).toBe(false);
    expect(await isMissingDetail("/listings/abc/edit", base)).toBe(false);
    expect(await isMissingDetail("/guide", base)).toBe(false);
  });
});

describe("플래그 꺼진 화면 404(proxy)", () => {
  it("입찰 대행·경매 마이페이지는 플래그가 없으면 404, 있으면 통과, 다른 경로는 영향 없음", () => {
    const off = { mb: undefined, au: undefined }, on = { mb: "1", au: "1" };
    for (const p of ["/bids/00000000-0000-0000-0000-000000000000", "/mypage/bids", "/mypage/auctions"]) {
      expect(isFlagOffPath(p, off)).toBe(true);
      expect(isFlagOffPath(p, on)).toBe(false);
    }
    expect(isFlagOffPath("/mypage/bidsx", off)).toBe(false);
    expect(isFlagOffPath("/mypage", off)).toBe(false);
    expect(isFlagOffPath("/mypage/auctions", { mb: undefined, au: "1" })).toBe(false);
  });
});
