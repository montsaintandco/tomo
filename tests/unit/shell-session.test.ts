import { describe, it, expect } from "vitest";
import { PROTECTED, isProtectedPath } from "../../proxy";
import { hasAuthCookie, projectRef, cookieNames, hasOwnBottomBar, hideSupportLauncher } from "../../components/shell/session";

// proxy.ts 범위를 줄일 때 보호 경로가 빠지지 않게 목록을 고정한다(05 T5 위험).
describe("보호 경로", () => {
  it("목록이 그대로다", () => {
    expect([...PROTECTED]).toEqual(["/sell", "/chat", "/transactions", "/admin", "/proxy", "/onboarding"]);
  });
  it("하위 경로도 보호된다", () => {
    for (const p of ["/sell", "/sell/new", "/chat", "/chat/abc", "/transactions/1", "/admin", "/admin/orders", "/proxy/x", "/onboarding"]) {
      expect(isProtectedPath(p), p).toBe(true);
    }
  });
  it("공개 경로는 보호하지 않는다(페이지가 스스로 로그인으로 보내는 /mypage·/cart·/order 포함)", () => {
    for (const p of ["/", "/global", "/listings/1", "/profile/1", "/help", "/login", "/mypage", "/cart", "/order", "/travel"]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
  });
});

describe("세션 쿠키 추정", () => {
  it("프로젝트 ref 는 Supabase 주소의 첫 이름이다", () => {
    expect(projectRef("https://abcd.supabase.co")).toBe("abcd");
    expect(projectRef("")).toBe("");
  });
  it("tomo 프로젝트의 sb-<ref>-auth-token 과 쪼갠 쿠키를 알아본다", () => {
    expect(hasAuthCookie(["tomo_lang", "sb-abcd-auth-token"], "abcd")).toBe(true);
    expect(hasAuthCookie(["sb-abcd-auth-token.0", "sb-abcd-auth-token.1"], "abcd")).toBe(true);
  });
  it("다른 프로젝트 쿠키·코드 검증 쿠키는 로그인으로 보지 않는다", () => {
    expect(hasAuthCookie([], "abcd")).toBe(false);
    expect(hasAuthCookie(["sb-other-auth-token", "sb-other-auth-token.0"], "abcd")).toBe(false);
    expect(hasAuthCookie(["sb-abcd-auth-token-code-verifier"], "abcd")).toBe(false);
    expect(hasAuthCookie(["sb-abcd-auth-token"], "")).toBe(false);
  });
  it("document.cookie 에서 이름만 뽑는다", () => {
    expect(cookieNames("tomo_lang=ja; sb-x-auth-token.0=base64-abc=; a=b")).toEqual(["tomo_lang", "sb-x-auth-token.0", "a"]);
    expect(cookieNames("")).toEqual([]);
  });
});

describe("하단 바·문의 버튼", () => {
  it("자기 하단 바가 있는 화면만 탭을 숨긴다", () => {
    for (const p of ["/listings/1", "/global/mercari/m1", "/cart", "/order", "/order/5", "/chat/abc"]) expect(hasOwnBottomBar(p), p).toBe(true);
    for (const p of ["/", "/global", "/chat", "/mypage", "/listings", "/sell", "/cartoon"]) expect(hasOwnBottomBar(p), p).toBe(false);
  });
  it("고객센터·채팅·결제 흐름에서는 문의 버튼을 숨긴다", () => {
    for (const p of ["/help", "/chat", "/chat/1", "/cart", "/order/3", "/login", "/admin/x", "/onboarding"]) expect(hideSupportLauncher(p), p).toBe(true);
    for (const p of ["/", "/global", "/listings/1", "/mypage", "/helpful"]) expect(hideSupportLauncher(p), p).toBe(false);
  });
});
