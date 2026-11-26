import { describe, expect, it } from "vitest";
import { detectInApp, externalOpenUrl } from "../../lib/inapp-browser";

const NAVER_AND = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.24.65)";
const NAVER_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.24.1; 15PRO)";
const KAKAO_AND = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 KAKAOTALK/11.2.0 (INAPP)";
const KAKAO_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.2.0";
const LINE_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.20.0";
const CHROME_AND = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36";
const CHROME_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("detectInApp", () => {
  it("네이버·카카오톡·라인 인앱을 기기와 함께 알아본다", () => {
    expect(detectInApp(NAVER_AND)).toEqual({ app: "naver", platform: "android" });
    expect(detectInApp(NAVER_IOS)).toEqual({ app: "naver", platform: "ios" });
    expect(detectInApp(KAKAO_AND)).toEqual({ app: "kakaotalk", platform: "android" });
    expect(detectInApp(KAKAO_IOS)).toEqual({ app: "kakaotalk", platform: "ios" });
    expect(detectInApp(LINE_IOS)).toEqual({ app: "line", platform: "ios" });
  });
  it("일반 브라우저는 인앱이 아니다", () => {
    for (const ua of [CHROME_AND, SAFARI_IOS, SAMSUNG, CHROME_PC, "", null, undefined]) expect(detectInApp(ua)).toBeNull();
  });
});

describe("externalOpenUrl", () => {
  const href = "https://tomo-delta.vercel.app/login?next=%2Fmypage";
  it("카카오톡은 공식 스킴", () => {
    expect(externalOpenUrl({ app: "kakaotalk", platform: "ios" }, href)).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(href)}`);
  });
  it("라인은 openExternalBrowser=1", () => {
    expect(externalOpenUrl({ app: "line", platform: "ios" }, href)).toBe(href + "&openExternalBrowser=1");
  });
  it("안드로이드 네이버는 크롬 intent(실패 때 지금 주소로)", () => {
    const u = externalOpenUrl({ app: "naver", platform: "android" }, href)!;
    expect(u.startsWith("intent://tomo-delta.vercel.app/login?next=%2Fmypage#Intent;scheme=https;package=com.android.chrome;")).toBe(true);
    expect(u).toContain(`S.browser_fallback_url=${encodeURIComponent(href)}`);
  });
  it("아이폰 네이버는 강제로 열 방법이 없어 null", () => {
    expect(externalOpenUrl({ app: "naver", platform: "ios" }, href)).toBeNull();
  });
  it("https 가 아니면 만들지 않는다", () => {
    expect(externalOpenUrl({ app: "naver", platform: "android" }, "http://localhost:3000/login")).toBeNull();
  });
});
