import { describe, it, expect } from "vitest";
import { parseAiTurns, cleanAiText, aiSegments, AGENT_MARK, AI_LIMITS } from "../lib/support-ai";
import { aiEnabled, supportAiModel, DEFAULT_MODEL, buildSystemPrompt, buildKnowledge } from "../lib/support-ai.server";
import { NODES } from "../lib/support-tree";
import { HELP_C } from "../lib/help-faq";
import { GUIDE_C } from "../lib/guide-content";

describe("폴백 판정", () => {
  it("키가 없거나 공백이면 꺼진다(봇 트리만)", () => {
    expect(aiEnabled({})).toBe(false);
    expect(aiEnabled({ AI_GATEWAY_API_KEY: "  " })).toBe(false);
    expect(aiEnabled({ AI_GATEWAY_API_KEY: "vck_x" })).toBe(true);
  });
  it("모델은 SUPPORT_AI_MODEL, 없으면 기본값", () => {
    expect(supportAiModel({})).toBe(DEFAULT_MODEL);
    expect(supportAiModel({ SUPPORT_AI_MODEL: "openai/gpt-x" })).toBe("openai/gpt-x");
  });
});

describe("프롬프트 조립", () => {
  it("뷰어 언어를 지시한다", () => {
    expect(buildSystemPrompt("ko", null)).toContain("답변 언어는 한국어");
    expect(buildSystemPrompt("ja", null)).toContain("답변 언어는 日本語");
  });
  it("그 언어의 사이트 문구가 지식으로 들어간다", () => {
    const ko = buildKnowledge("ko"), ja = buildKnowledge("ja");
    expect(ko).toContain(NODES.bill.answer![0][1]);
    expect(ja).toContain(NODES.bill.answer![1][1]);
    expect(ko).toContain(HELP_C.ko.faq[0][1]);
    expect(ja).toContain(GUIDE_C.ja.faq[0][1]);
    expect(ko).toContain("판매가의 10%");
    expect(ko).toContain("취소·환불 정책");
    expect(ja).not.toContain(HELP_C.ko.faq[0][1]);
  });
  it("정책 자리표시자({phone} 등)가 남지 않는다", () => {
    expect(buildKnowledge("ko")).not.toMatch(/\{(phone|email|hours|company|returnAddress)\}/);
  });
  it("비로그인/로그인 분기", () => {
    expect(buildSystemPrompt("ko", null)).toContain("비로그인 고객");
    const p = buildSystemPrompt("ko", "- 직거래 구매 #abcd1234 · 상태: 결제 완료");
    expect(p).toContain("#abcd1234");
    expect(p).not.toContain("비로그인 고객");
  });
  it("상담원 표시 규칙이 들어 있다", () => {
    expect(buildSystemPrompt("ko", null)).toContain(AGENT_MARK);
  });
});

describe("요청 검사·답변 정리", () => {
  it("질문으로 끝나야 하고 길이 제한", () => {
    expect(parseAiTurns([{ role: "user", content: "배송 얼마나 걸려요?" }])).toHaveLength(1);
    expect(parseAiTurns([{ role: "assistant", content: "x" }])).toBeNull();
    expect(parseAiTurns([{ role: "user", content: "a".repeat(AI_LIMITS.maxChars + 1) }])).toBeNull();
    expect(parseAiTurns([{ role: "system", content: "x" }])).toBeNull();
    expect(parseAiTurns("x")).toBeNull();
  });
  it("앞의 assistant 는 버리고 최근 대화만", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    many.push({ role: "user", content: "last" });
    const out = parseAiTurns(many)!;
    expect(out.length).toBeLessThanOrEqual(AI_LIMITS.maxTurns);
    expect(out[0].role).toBe("user");
    expect(out.at(-1)!.content).toBe("last");
  });
  it("상담원 표시를 떼고 플래그로", () => {
    expect(cleanAiText(`확인이 필요해요. ${AGENT_MARK}`)).toEqual({ text: "확인이 필요해요.", agent: true });
    expect(cleanAiText("답변 중 <<AG").text).toBe("답변 중");
    expect(cleanAiText("**굵게** 글").text).toBe("굵게 글");
  });
  it("허용된 사이트 경로만 링크", () => {
    expect(aiSegments("[환불 정책](/refund) 참고")).toEqual([{ text: "환불 정책", to: "/refund" }, { text: " 참고" }]);
    expect(aiSegments("[가짜](/nope)")).toEqual([{ text: "가짜" }]);
    expect(aiSegments("[밖](https://evil.example)")).toEqual([{ text: "밖" }]);
  });
});
